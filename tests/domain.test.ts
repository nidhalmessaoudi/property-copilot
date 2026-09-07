import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, type SqliteDatabase } from "../src/lib/db";
import { createTask, getRentStatus, listUpcomingDeadlines } from "../src/lib/domain";

let db: SqliteDatabase | undefined;
afterEach(() => { db?.close(); db = undefined; });

describe("property domain", () => {
  it("calculates overdue rent from real records", () => {
    db = createDatabase(":memory:");
    const overdue = getRentStatus({ status: "overdue" }, db);
    expect(overdue.map((record) => record.tenantName)).toEqual(expect.arrayContaining(["John Carter", "Alex Rivera"]));
    expect(overdue.every((record) => record.status === "overdue")).toBe(true);
  });

  it("surfaces leases expiring in the next 60 days", () => {
    db = createDatabase(":memory:");
    const deadlines = listUpcomingDeadlines(60, db);
    expect(deadlines.some((deadline) => deadline.title.includes("John Carter"))).toBe(true);
    expect(deadlines.some((deadline) => deadline.title.includes("Alex Rivera"))).toBe(true);
  });

  it("creates a linked task", () => {
    db = createDatabase(":memory:");
    const task = createTask({ title: "Call John", description: "Discuss renewal", dueDate: "2099-01-01", priority: "high", tenantId: "tenant-john" }, db);
    expect(task.title).toBe("Call John");
    expect(task.tenantName).toBe("John Carter");
    expect(task.status).toBe("open");
  });
});
