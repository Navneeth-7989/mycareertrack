"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "cn";

import { KanbanCard, KanbanCardPreview } from "@/components/applications/kanban-card";
import { APPLICATION_STATUS_TONES } from "@/components/applications/status-badge";
import { useStatusChange } from "@/components/applications/use-status-change";
import { ButtonLink } from "@/components/ui/button";
import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatusValue,
} from "@/lib/constants/application";
import type { BoardColumn } from "@/server/queries/applications";

/**
 * The Kanban board.
 *
 * Drag is a **convenience**, never the mechanism (§1). Every card carries a
 * status dropdown that does the same thing, so the pipeline is fully usable
 * with a keyboard, on a phone, and if the drag sensors misbehave. That is a
 * deliberate inversion of how most boards are built, and it is why the hardest
 * piece of UI in the product cannot take a feature down with it.
 *
 * Both paths call the same `move()`, so there is one request shape, one
 * optimistic update and one rollback — not a drag code path and a menu code
 * path that drift.
 *
 * **State lives on the server.** The columns are props from a Server Component;
 * this holds only an overlay of moves that are in flight. See `pending` below
 * for why that is simpler than mirroring the data.
 */

/** Pointer must travel this far before a drag begins, so a click stays a click. */
const DRAG_ACTIVATION_DISTANCE = 6;

export function KanbanBoard({ columns }: { columns: BoardColumn[] }) {
  /** The request, the toasts and the refresh — shared with the table's pill. */
  const changeStatus = useStatusChange();

  /**
   * Moves that have been made locally but not yet confirmed by a re-render
   * from the server: `{ applicationId: status }`.
   *
   * An overlay rather than a copy of the columns. Two things fall out of that:
   * a filter change or a refresh flows straight through as new props with
   * nothing to reconcile, and an entry that the server has caught up with
   * becomes a harmless no-op instead of something that has to be cleaned up at
   * exactly the right moment.
   */
  const [pending, setPending] = useState<Record<string, ApplicationStatusValue>>({});

  /** Ids with a request in flight, so their controls can be disabled. */
  const [inFlight, setInFlight] = useState<string[]>([]);

  const [draggingId, setDraggingId] = useState<string | null>(null);

  /*
   * One sensor, and the omissions are the design.
   *
   * No `TouchSensor`: a touch drag on a horizontally scrolling board fights the
   * browser's own scrolling, and the usual fix — a long-press delay — makes the
   * board feel broken for everyone who was only trying to scroll. §1 names this
   * as the single hardest piece of UI in the product, and the mitigation is
   * exactly this: on touch, cards move through the dropdown.
   *
   * No `KeyboardSensor` either. It needs a focusable activator to fire, and the
   * drag handle is deliberately not focusable (see `KanbanCard`) — so including
   * it would be dead code that looks like an accessibility feature. Keyboard
   * users get the dropdown, which is the primary control and is fully
   * operable.
   *
   * The distance constraint is what keeps a click on the handle from becoming a
   * one-pixel drag.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
  );

  const view = applyPending(columns, pending);
  const dragging = view.cards.get(draggingId ?? "");

  async function move(applicationId: string, status: ApplicationStatusValue) {
    const card = view.cards.get(applicationId);

    if (!card || card.status === status) {
      return;
    }

    const previous = card.status;

    setPending((current) => ({ ...current, [applicationId]: status }));
    setInFlight((current) => [...current, applicationId]);

    const ok = await changeStatus({
      id: applicationId,
      status,
      jobTitle: card.item.jobTitle,
      companyName: card.item.company.name,
    });

    // Roll the card back to where it was. Leaving it in the new column after a
    // failed write is the worst outcome available: the board would disagree
    // with the database until the next reload, and the user would have no
    // reason to doubt it.
    if (!ok) {
      setPending((current) => ({ ...current, [applicationId]: previous }));
    }

    setInFlight((current) => current.filter((id) => id !== applicationId));
  }

  function onDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggingId(null);

    const target = event.over?.id;

    // Dropped outside any column. Nothing happens, which is what "cancel"
    // should look like.
    if (typeof target !== "string") {
      return;
    }

    void move(String(event.active.id), target as ApplicationStatusValue);
  }

  return (
    <DndContext
      sensors={sensors}
      // `pointerWithin` rather than the default `closestCenter`: the targets are
      // tall columns, and closest-centre picks the column whose *centre* is
      // nearest the pointer — which, on a column taller than the viewport, is
      // regularly not the one under the cursor.
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      {/*
       * Horizontal scroll on desktop, stacked on mobile. The negative margin
       * lets the scroll area bleed to the screen edge so the last column is not
       * cut off by the page gutter, while the padding keeps the first card
       * aligned with everything above it.
       */}
      <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-4 md:w-max md:flex-row md:items-start">
          {view.columns.map((column) => (
            <Column key={column.status} column={column} inFlight={inFlight} onStatusChange={move} />
          ))}
        </div>
      </div>

      {/*
       * The floating card follows the pointer. Without an overlay the original
       * card is transformed in place, which means it is clipped by the column's
       * own overflow the moment it leaves — so a card can never visibly reach
       * the column beside it.
       */}
      <DragOverlay dropAnimation={null}>
        {dragging ? <KanbanCardPreview item={dragging.item} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  column,
  inFlight,
  onStatusChange,
}: {
  column: BoardColumn;
  inFlight: string[];
  onStatusChange: (id: string, status: ApplicationStatusValue) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  const tone = APPLICATION_STATUS_TONES[column.status];

  return (
    <section
      ref={setNodeRef}
      aria-label={`${APPLICATION_STATUS_LABELS[column.status]} — ${column.total}`}
      className={cn(
        "flex shrink-0 flex-col rounded-xl border transition-colors md:w-[18.5rem]",
        isOver ? "border-primary/50 bg-accent/60" : "border-border bg-muted/35 dark:bg-muted/15",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", tone.dot)} />

        <h2 className="text-[0.8125rem] font-semibold tracking-tight">
          {APPLICATION_STATUS_LABELS[column.status]}
        </h2>

        <span className="text-muted-foreground text-xs tabular-nums">{column.total}</span>
      </header>

      <div className="flex flex-col gap-2 px-2 pb-2 md:max-h-[calc(100vh-19rem)] md:overflow-y-auto">
        {column.items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            status={column.status}
            isPending={inFlight.includes(item.id)}
            onStatusChange={(next) => onStatusChange(item.id, next)}
          />
        ))}

        {column.items.length === 0 && (
          /*
           * An empty column still needs height, because it is the only place a
           * card can be dropped to reach this status. A zero-height column is
           * an unreachable one.
           */
          <p className="text-muted-foreground/70 rounded-lg border border-dashed px-3 py-6 text-center text-xs">
            {isOver ? "Drop to move here" : "Nothing here"}
          </p>
        )}

        {column.hasMore && (
          <ButtonLink
            variant="ghost"
            size="sm"
            href={`/applications?view=table&status=${column.status}`}
            className="justify-start"
          >
            +{column.total - column.items.length} more in the table
          </ButtonLink>
        )}
      </div>
    </section>
  );
}

type BoardCard = { item: BoardColumn["items"][number]; status: ApplicationStatusValue };

/**
 * Re-groups the server's columns under the in-flight moves.
 *
 * Done on every render rather than stored, so the server's data stays the
 * single source of truth and an overlay entry the server has caught up with
 * simply stops mattering. The counts are adjusted by the net movement so a card
 * does not appear in its new column while the old column still counts it.
 */
function applyPending(
  columns: BoardColumn[],
  pending: Record<string, ApplicationStatusValue>,
): { columns: BoardColumn[]; cards: Map<string, BoardCard> } {
  const cards = new Map<string, BoardCard>();
  const grouped = new Map<ApplicationStatusValue, BoardColumn["items"]>();
  const delta = new Map<ApplicationStatusValue, number>();

  for (const column of columns) {
    for (const item of column.items) {
      const status = pending[item.id] ?? column.status;

      cards.set(item.id, { item, status });

      const bucket = grouped.get(status);

      if (bucket) {
        bucket.push(item);
      } else {
        grouped.set(status, [item]);
      }

      if (status !== column.status) {
        delta.set(status, (delta.get(status) ?? 0) + 1);
        delta.set(column.status, (delta.get(column.status) ?? 0) - 1);
      }
    }
  }

  return {
    cards,
    columns: columns.map((column) => {
      const items = grouped.get(column.status) ?? [];
      const total = column.total + (delta.get(column.status) ?? 0);

      return {
        ...column,
        items,
        total,
        // A card moved *into* a truncated column is on screen, so the "+N more"
        // count has to come down with it rather than double-counting.
        hasMore: total > items.length,
      };
    }),
  };
}
