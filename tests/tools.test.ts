import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, type SqliteDatabase } from "../src/lib/db";
import { executeTool } from "../src/lib/tools";
import { dateFromToday } from "../src/lib/format";

let db: SqliteDatabase | undefined;
afterEach(() => { db?.close(); db = undefined; });

describe("copilot tools", () => {
  it("returns controlled property data", async () => {
    db = createDatabase(":memory:");
    const result = await executeTool("listProperties", {}, db);
    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Elm Street Lofts" })]));
  });

  it("validates tool inputs before calling application functions", async () => {
    db = createDatabase(":memory:");
    await expect(executeTool("createTask", { title: "x", dueDate: "not-a-date" }, db)).rejects.toThrow();
    await expect(executeTool("createTask", { title: "Real task", dueDate: "2025-02-31" }, db)).rejects.toThrow();
  });

  it("rejects task relationships that do not match", async () => {
    db = createDatabase(":memory:");
    await expect(executeTool("createTask", { title: "Wrong property", dueDate: "2099-01-01", tenantId: "tenant-john", propertyId: "prop-harbor" }, db)).rejects.toThrow("do not match");
  });

  it("rents an available property through one controlled application action", async () => {
    db = createDatabase(":memory:");
    const result = await executeTool("rentProperty", { propertyId: "Maple Court", tenantName: "Amin Samaali", monthlyRent: 5000 }, db) as { property: { status: string; monthlyValue: number }; tenant: { name: string }; lease: { monthlyRent: number }; rentRecord: { dueDate: string } };
    expect(result.property).toEqual(expect.objectContaining({ status: "occupied", monthlyValue: 5000 }));
    expect(result.tenant.name).toBe("Amin Samaali");
    expect(result.lease.monthlyRent).toBe(5000);
    expect(result.rentRecord.dueDate).toBe(dateFromToday(1));
  });

  it("creates a task without exposing database access to the caller", async () => {
    db = createDatabase(":memory:");
    const result = await executeTool("createTask", { title: "Follow up with John", dueDate: "2099-01-01", tenantId: "tenant-john" }, db);
    expect(result).toEqual(expect.objectContaining({ title: "Follow up with John", tenantId: "tenant-john" }));
  });
});
