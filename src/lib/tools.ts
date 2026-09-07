import { z } from "zod";
import { createTask, getLease, getProperty, getRentStatus, getTenant, listProperties, listTenants, listUpcomingDeadlines, rentProperty } from "./domain";
import type { SqliteDatabase } from "./db";
import { isValidDateOnly } from "./format";

const toolSchemas = {
  listProperties: z.object({}),
  getProperty: z.object({ propertyId: z.string().min(1) }),
  listTenants: z.object({ search: z.string().min(1).optional() }),
  getTenant: z.object({ tenantId: z.string().min(1) }),
  getLease: z.object({ leaseId: z.string().optional(), tenantId: z.string().optional(), tenantName: z.string().optional(), propertyId: z.string().optional() }).refine((value) => value.leaseId || value.tenantId || value.tenantName || value.propertyId, "Provide a lease, tenant, or property identifier"),
  getRentStatus: z.object({ tenantId: z.string().optional(), tenantName: z.string().optional(), status: z.enum(["paid", "overdue", "pending"]).optional() }),
  listUpcomingDeadlines: z.object({ days: z.number().int().min(1).max(365).optional() }),
  createTask: z.object({ title: z.string().trim().min(3).max(160), description: z.string().max(1000).optional(), dueDate: z.string().refine(isValidDateOnly, "Due date must be a real date in YYYY-MM-DD format"), priority: z.enum(["low", "medium", "high"]).optional(), tenantId: z.string().optional(), propertyId: z.string().optional() }),
  rentProperty: z.object({ propertyId: z.string().trim().min(1), tenantName: z.string().trim().min(2).max(120), monthlyRent: z.number().positive().max(1000000), email: z.string().email().optional(), phone: z.string().max(40).optional(), unit: z.string().max(30).optional(), leaseEndDate: z.string().refine(isValidDateOnly, "Lease end date must be a real date in YYYY-MM-DD format").optional() }),
};

export type ToolName = keyof typeof toolSchemas;
export type ToolInput = { [K in ToolName]: z.infer<(typeof toolSchemas)[K]> };

export const toolDefinitions = [
  { name: "listProperties", description: "List all managed properties and their occupancy summary.", parameters: { type: "object", properties: {} } },
  { name: "getProperty", description: "Get one property by ID or a distinctive part of its name.", parameters: { type: "object", properties: { propertyId: { type: "string", description: "Property ID or name" } }, required: ["propertyId"] } },
  { name: "listTenants", description: "List tenants, optionally searching by name or email.", parameters: { type: "object", properties: { search: { type: "string" } } } },
  { name: "getTenant", description: "Get one tenant by ID or name.", parameters: { type: "object", properties: { tenantId: { type: "string", description: "Tenant ID or name" } }, required: ["tenantId"] } },
  { name: "getLease", description: "Get a lease by lease ID, tenant, or property.", parameters: { type: "object", properties: { leaseId: { type: "string" }, tenantId: { type: "string" }, tenantName: { type: "string" }, propertyId: { type: "string" } } } },
  { name: "getRentStatus", description: "Find rent records and whether they are paid, overdue, or pending. Use tenantName for a person's rent.", parameters: { type: "object", properties: { tenantId: { type: "string" }, tenantName: { type: "string" }, status: { type: "string", enum: ["paid", "overdue", "pending"] } } } },
  { name: "listUpcomingDeadlines", description: "List upcoming lease expirations, open tasks, and overdue rent follow-ups.", parameters: { type: "object", properties: { days: { type: "number", description: "Lookahead window, from 1 to 365 days" } } } },
  { name: "createTask", description: "Create an internal follow-up task. Use this when the user explicitly asks to create, add, or schedule a task.", parameters: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, dueDate: { type: "string", description: "Due date in YYYY-MM-DD format" }, priority: { type: "string", enum: ["low", "medium", "high"] }, tenantId: { type: "string" }, propertyId: { type: "string" } }, required: ["title", "dueDate"] } },
  { name: "rentProperty", description: "Mark an available property as rented. This updates the property, creates or links the tenant, creates a lease, and records the first rent charge due tomorrow. Use it when the user says a property was rented or wants to rent a property to a tenant.", parameters: { type: "object", properties: { propertyId: { type: "string", description: "Property ID or name" }, tenantName: { type: "string" }, monthlyRent: { type: "number" }, email: { type: "string" }, phone: { type: "string" }, unit: { type: "string" }, leaseEndDate: { type: "string", description: "Lease end date in YYYY-MM-DD format; defaults to one year from today" } }, required: ["propertyId", "tenantName", "monthlyRent"] } },
] as const;

export async function executeTool(name: string, rawInput: unknown, db?: SqliteDatabase) {
  if (!(name in toolSchemas)) throw new Error(`Unknown tool: ${name}`);
  switch (name as ToolName) {
    case "listProperties": toolSchemas.listProperties.parse(rawInput); return listProperties(db);
    case "getProperty": { const input = toolSchemas.getProperty.parse(rawInput); return getProperty(input.propertyId, db); }
    case "listTenants": { const input = toolSchemas.listTenants.parse(rawInput); return listTenants(input.search, db); }
    case "getTenant": { const input = toolSchemas.getTenant.parse(rawInput); return getTenant(input.tenantId, db); }
    case "getLease": { const input = toolSchemas.getLease.parse(rawInput); return getLease(input, db); }
    case "getRentStatus": { const input = toolSchemas.getRentStatus.parse(rawInput); return getRentStatus(input, db); }
    case "listUpcomingDeadlines": { const input = toolSchemas.listUpcomingDeadlines.parse(rawInput); return listUpcomingDeadlines(input.days ?? 60, db); }
    case "createTask": { const input = toolSchemas.createTask.parse(rawInput); return createTask(input, db); }
    case "rentProperty": { const input = toolSchemas.rentProperty.parse(rawInput); return rentProperty(input, db); }
  }
}
