"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";

/**
 * Dropdown menu, styled to match the combobox popup — same radius, same
 * elevation, same item metrics, because the two appear within a few hundred
 * pixels of each other and any difference reads as a mistake.
 *
 * Base UI handles the parts that are easy to get wrong by hand: focus returns
 * to the trigger on close, Escape and outside clicks dismiss, and arrow keys
 * move between items.
 */
const Menu = MenuPrimitive.Root;
const MenuTrigger = MenuPrimitive.Trigger;

function MenuContent({
  className,
  side = "bottom",
  sideOffset = 8,
  align = "end",
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "side" | "align" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50"
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            "bg-popover text-popover-foreground border-border data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 min-w-56 origin-(--transform-origin) overflow-hidden rounded-xl border p-1.5 shadow-lg duration-100",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

const ITEM_CLASSES =
  "relative flex w-full cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

function MenuItem({
  className,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & { variant?: "default" | "destructive" }) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      data-variant={variant}
      className={cn(
        ITEM_CLASSES,
        variant === "destructive" &&
          "text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function MenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) {
  return (
    <MenuPrimitive.LinkItem
      data-slot="menu-link-item"
      className={cn(ITEM_CLASSES, className)}
      {...props}
    />
  );
}

/**
 * A menu item that toggles.
 *
 * `closeOnClick` is false, which is the whole reason this exists as its own
 * part: these are used for filters, where the normal action is to tick three
 * statuses in a row. A menu that closed on each tick would make choosing two
 * things take two trips.
 *
 * The indicator is a real box rather than a tick in empty space, so an
 * unchecked row still shows where the tick will go — a bare checkmark that
 * appears from nothing reads as decoration rather than as state.
 */
function MenuCheckboxItem({
  className,
  children,
  closeOnClick = false,
  ...props
}: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="menu-checkbox-item"
      closeOnClick={closeOnClick}
      className={cn(ITEM_CLASSES, "pl-2", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className="border-input bg-card group-data-[checked]/menu-checkbox:border-primary in-data-[checked]:border-primary in-data-[checked]:bg-primary in-data-[checked]:text-primary-foreground flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] border shadow-xs transition-colors"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon className="size-3 stroke-[3]" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>

      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

function MenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="menu-group" {...props} />;
}

function MenuGroupLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menu-group-label"
      className={cn("text-muted-foreground px-2.5 py-1.5 text-xs font-medium", className)}
      {...props}
    />
  );
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("bg-border -mx-1.5 my-1.5 h-px", className)}
      {...props}
    />
  );
}

export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuLinkItem,
  MenuSeparator,
};
