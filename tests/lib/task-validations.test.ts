import { describe, expect, it } from "vitest";

import {
  EMPTY_TASK_FORM,
  createTaskSchema,
  taskFormSchema,
  toTaskFormValues,
  toggleTaskCompletionSchema,
  updateTaskSchema,
} from "@/lib/validations/task";

/**
 * Tasks (DESIGN.md §7, Phase 3 step 6).
 *
 * The structural thing that makes tasks different from every other child in this phase is
 * that **the parent is optional** — §3 has `applicationId` nullable with the comment
 * "standalone tasks are allowed". Most of what is worth testing here is that the three
 * ways of saying "no application" all arrive as null.
 */

const VALID = {
  title: "Follow up with the recruiter",
  description: "Ask about next steps.",
  dueDate: "2026-03-14",
  priority: "HIGH",
};

describe("taskFormSchema", () => {
  it("stores the due date as midnight UTC", () => {
    expect(taskFormSchema.parse(VALID).dueDate?.toISOString()).toBe("2026-03-14T00:00:00.000Z");
  });

  it("turns blank optionals into null", () => {
    const parsed = taskFormSchema.parse({ ...VALID, description: "", dueDate: "" });

    expect(parsed.description).toBeNull();
    expect(parsed.dueDate).toBeNull();
  });

  it("defaults the priority to MEDIUM", () => {
    const { priority, ...withoutPriority } = VALID;

    expect(taskFormSchema.parse(withoutPriority).priority).toBe("MEDIUM");
    expect(priority).toBe("HIGH");
  });

  /** A task written down because you have just realised you are late on it. */
  it("accepts a due date in the past", () => {
    expect(taskFormSchema.safeParse({ ...VALID, dueDate: "2020-01-01" }).success).toBe(true);
  });

  /** No date at all is a "someday" item, which the Upcoming bucket holds. */
  it("accepts no due date", () => {
    expect(taskFormSchema.parse({ ...VALID, dueDate: "" }).dueDate).toBeNull();
  });

  it.each([
    { name: "an empty title", input: { title: "" }, path: "title" },
    { name: "a whitespace-only title", input: { title: "   " }, path: "title" },
    { name: "a title over 200 characters", input: { title: "x".repeat(201) }, path: "title" },
    { name: "a malformed due date", input: { dueDate: "14-03-2026" }, path: "dueDate" },
    { name: "a due date that does not exist", input: { dueDate: "2026-02-31" }, path: "dueDate" },
    { name: "an unknown priority", input: { priority: "URGENT" }, path: "priority" },
  ])("rejects $name", ({ input, path }) => {
    const result = taskFormSchema.safeParse({ ...VALID, ...input });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(path);
  });
});

/**
 * The optional parent, which is the whole reason tasks need their own treatment. Three
 * spellings of "nothing" all have to arrive as null, because the form renders "Not tied to
 * an application" as an empty-string option while a client that omits the key entirely is
 * also valid.
 */
describe("the optional application", () => {
  it.each([
    { name: "an empty string, as the picker's no-application row sends", value: "" },
    { name: "an omitted key", value: undefined },
  ])("treats $name as null", ({ value }) => {
    const parsed = createTaskSchema.parse(
      value === undefined ? VALID : { ...VALID, applicationId: value },
    );

    expect(parsed.applicationId).toBeNull();
  });

  it("keeps a real id", () => {
    expect(createTaskSchema.parse({ ...VALID, applicationId: "abc123" }).applicationId).toBe(
      "abc123",
    );
  });

  /**
   * Unlike interviews and assessments, re-parenting **is** allowed — attaching a standalone
   * task to an application, or detaching one, is a real intent. So the update schema keeps
   * the field rather than stripping it.
   */
  it("is editable on update, unlike interviews and assessments", () => {
    expect(updateTaskSchema.parse({ ...VALID, applicationId: "abc123" }).applicationId).toBe(
      "abc123",
    );
    expect(updateTaskSchema.parse({ ...VALID, applicationId: "" }).applicationId).toBeNull();
  });

  it("rejects an id longer than the column could hold", () => {
    const result = createTaskSchema.safeParse({ ...VALID, applicationId: "x".repeat(65) });

    expect(result.success).toBe(false);
  });
});

/**
 * Completion has its own endpoint and its own schema, for the same reason an application's
 * status does: flipping it maintains the derived `completedAt` column, and a field edit must
 * not be a second route to that.
 */
describe("toggleTaskCompletionSchema", () => {
  it("takes a real boolean", () => {
    expect(toggleTaskCompletionSchema.parse({ isCompleted: true }).isCompleted).toBe(true);
    expect(toggleTaskCompletionSchema.parse({ isCompleted: false }).isCompleted).toBe(false);
  });

  it.each(["true", 1, null, undefined])("rejects %s, which is not a boolean", (value) => {
    expect(toggleTaskCompletionSchema.safeParse({ isCompleted: value }).success).toBe(false);
  });

  it("cannot be reached through the general update schema", () => {
    const parsed = updateTaskSchema.parse({ ...VALID, isCompleted: true });

    expect("isCompleted" in parsed).toBe(false);
  });
});

describe("toTaskFormValues", () => {
  it("is the inverse of what the form schema does on submit", () => {
    const parsed = taskFormSchema.parse(VALID);

    expect(toTaskFormValues(parsed)).toEqual(VALID);
  });

  it("reads the due date back in UTC, not local time", () => {
    const values = toTaskFormValues({
      title: "Something",
      description: null,
      dueDate: new Date("2026-03-14T00:00:00.000Z"),
      priority: "LOW",
    });

    expect(values.dueDate).toBe("2026-03-14");
    expect(values.description).toBe("");
  });
});

describe("EMPTY_TASK_FORM", () => {
  it("needs only a title to become valid", () => {
    const result = taskFormSchema.safeParse(EMPTY_TASK_FORM);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(["title"]);
  });
});

describe("the form-posts-raw-values contract", () => {
  it("cannot parse its own output", () => {
    const parsed = taskFormSchema.parse(VALID);

    expect(taskFormSchema.safeParse(parsed).success).toBe(false);
  });
});
