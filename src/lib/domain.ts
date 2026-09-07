import type { SqliteDatabase } from "./db";
import { getDb } from "./db";
import { daysFromToday, todayDate } from "./format";
import type { DashboardData, Deadline, Lease, Property, RentRecord, Task, Tenant } from "./types";

function dbOrDefault(db?: SqliteDatabase) { return db ?? getDb(); }

export function listProperties(db?: SqliteDatabase): Property[] {
  return dbOrDefault(db).prepare("SELECT id, name, address, city, units, status, monthly_value as monthlyValue FROM properties ORDER BY name").all() as Property[];
}

export function getProperty(idOrName: string, db?: SqliteDatabase): Property | null {
  return dbOrDefault(db).prepare("SELECT id, name, address, city, units, status, monthly_value as monthlyValue FROM properties WHERE id = ? OR lower(name) LIKE lower(?) LIMIT 1").get(idOrName, `%${idOrName}%`) as Property | null;
}

export function listTenants(search?: string, db?: SqliteDatabase): Tenant[] {
  const database = dbOrDefault(db);
  if (search) {
    return database.prepare("SELECT t.id, t.name, t.email, t.phone, t.property_id as propertyId, p.name as propertyName, t.unit FROM tenants t JOIN properties p ON p.id = t.property_id WHERE lower(t.name) LIKE lower(?) OR lower(t.email) LIKE lower(?) ORDER BY t.name").all(`%${search}%`, `%${search}%`) as Tenant[];
  }
  return database.prepare("SELECT t.id, t.name, t.email, t.phone, t.property_id as propertyId, p.name as propertyName, t.unit FROM tenants t JOIN properties p ON p.id = t.property_id ORDER BY t.name").all() as Tenant[];
}

export function getTenant(idOrName: string, db?: SqliteDatabase): Tenant | null {
  return dbOrDefault(db).prepare("SELECT t.id, t.name, t.email, t.phone, t.property_id as propertyId, p.name as propertyName, t.unit FROM tenants t JOIN properties p ON p.id = t.property_id WHERE t.id = ? OR lower(t.name) LIKE lower(?) LIMIT 1").get(idOrName, `%${idOrName}%`) as Tenant | null;
}

export function listLeases(db?: SqliteDatabase): Lease[] {
  const rows = dbOrDefault(db).prepare("SELECT l.id, l.tenant_id as tenantId, t.name as tenantName, l.property_id as propertyId, p.name as propertyName, l.unit, l.start_date as startDate, l.end_date as endDate, l.monthly_rent as monthlyRent FROM leases l JOIN tenants t ON t.id = l.tenant_id JOIN properties p ON p.id = l.property_id ORDER BY l.end_date").all() as Omit<Lease, "status" | "daysUntilExpiry">[];
  return rows.map(withLeaseStatus);
}

export function getLease(input: { leaseId?: string; tenantId?: string; tenantName?: string; propertyId?: string }, db?: SqliteDatabase): Lease | null {
  const database = dbOrDefault(db);
  const value = input.leaseId ?? input.tenantId ?? input.tenantName ?? input.propertyId;
  if (!value) return null;
  const row = database.prepare("SELECT l.id, l.tenant_id as tenantId, t.name as tenantName, l.property_id as propertyId, p.name as propertyName, l.unit, l.start_date as startDate, l.end_date as endDate, l.monthly_rent as monthlyRent FROM leases l JOIN tenants t ON t.id = l.tenant_id JOIN properties p ON p.id = l.property_id WHERE l.id = ? OR l.tenant_id = ? OR lower(t.name) LIKE lower(?) OR l.property_id = ? LIMIT 1").get(value, value, `%${value}%`, value) as Omit<Lease, "status" | "daysUntilExpiry"> | undefined;
  return row ? withLeaseStatus(row) : null;
}

function withLeaseStatus(row: Omit<Lease, "status" | "daysUntilExpiry">): Lease {
  const daysUntilExpiry = daysFromToday(row.endDate);
  return { ...row, daysUntilExpiry, status: daysUntilExpiry < 0 ? "expired" : daysUntilExpiry <= 60 ? "expiring" : "active" };
}

export function getRentStatus(input: { tenantId?: string; tenantName?: string; status?: "paid" | "overdue" | "pending" }, db?: SqliteDatabase): RentRecord[] {
  const database = dbOrDefault(db);
  const tenantFilter = input.tenantId ?? input.tenantName;
  const clauses = ["1 = 1"];
  const args: string[] = [];
  if (tenantFilter) { clauses.push("(r.tenant_id = ? OR lower(t.name) LIKE lower(?))"); args.push(tenantFilter, `%${tenantFilter}%`); }
  if (input.status) {
    if (input.status === "paid") clauses.push("r.paid_date IS NOT NULL");
    if (input.status === "overdue") clauses.push("r.paid_date IS NULL AND r.due_date < date('now')");
    if (input.status === "pending") clauses.push("r.paid_date IS NULL AND r.due_date >= date('now')");
  }
  const rows = database.prepare(`SELECT r.id, r.tenant_id as tenantId, t.name as tenantName, p.name as propertyName, t.unit, r.due_date as dueDate, r.amount, r.paid_date as paidDate FROM rent_records r JOIN tenants t ON t.id = r.tenant_id JOIN properties p ON p.id = t.property_id WHERE ${clauses.join(" AND ")} ORDER BY r.due_date DESC`).all(...args) as Omit<RentRecord, "status">[];
  const today = todayDate();
  return rows.map((row) => ({ ...row, status: row.paidDate ? "paid" : row.dueDate < today ? "overdue" : "pending" }));
}

export function listTasks(db?: SqliteDatabase): Task[] {
  return dbOrDefault(db).prepare("SELECT t.id, t.title, t.description, t.due_date as dueDate, t.priority, t.status, t.tenant_id as tenantId, tn.name as tenantName, t.property_id as propertyId, p.name as propertyName, t.created_at as createdAt FROM tasks t LEFT JOIN tenants tn ON tn.id = t.tenant_id LEFT JOIN properties p ON p.id = t.property_id ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, t.due_date").all() as Task[];
}

export function createTask(input: { title: string; description?: string; dueDate: string; priority?: "low" | "medium" | "high"; tenantId?: string; propertyId?: string }, db?: SqliteDatabase): Task {
  const database = dbOrDefault(db);
  const tenant = input.tenantId ? database.prepare("SELECT id, property_id as propertyId FROM tenants WHERE id = ?").get(input.tenantId) as { id: string; propertyId: string } | undefined : undefined;
  const property = input.propertyId ? database.prepare("SELECT id FROM properties WHERE id = ?").get(input.propertyId) as { id: string } | undefined : undefined;
  if (input.tenantId && !tenant) throw new Error("The requested tenant was not found");
  if (input.propertyId && !property) throw new Error("The requested property was not found");
  if (tenant && input.propertyId && tenant.propertyId !== input.propertyId) throw new Error("The tenant and property do not match");
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  database.prepare("INSERT INTO tasks (id, title, description, due_date, priority, status, tenant_id, property_id, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)").run(id, input.title, input.description ?? "", input.dueDate, input.priority ?? "medium", input.tenantId ?? null, input.propertyId ?? tenant?.propertyId ?? null, todayDate());
  return listTasks(database).find((task) => task.id === id)!;
}

export function listUpcomingDeadlines(days = 60, db?: SqliteDatabase): Deadline[] {
  const deadlines: Deadline[] = [];
  for (const lease of listLeases(db)) {
    if (lease.daysUntilExpiry >= 0 && lease.daysUntilExpiry <= days) deadlines.push({ id: `lease-${lease.id}`, type: "lease", title: `${lease.tenantName}'s lease expires`, subtitle: `${lease.propertyName} · Unit ${lease.unit}`, date: lease.endDate, daysAway: lease.daysUntilExpiry, priority: lease.daysUntilExpiry <= 30 ? "high" : "medium", entityId: lease.id });
  }
  for (const task of listTasks(db)) {
    const daysAway = daysFromToday(task.dueDate);
    if (task.status === "open" && daysAway >= 0 && daysAway <= days) deadlines.push({ id: `task-${task.id}`, type: "task", title: task.title, subtitle: task.propertyName ?? "Workspace task", date: task.dueDate, daysAway, priority: task.priority, entityId: task.id });
  }
  for (const rent of getRentStatus({ status: "overdue" }, db)) deadlines.push({ id: `rent-${rent.id}`, type: "rent", title: `${rent.tenantName} has overdue rent`, subtitle: `${rent.propertyName} · ${rent.unit}`, date: rent.dueDate, daysAway: daysFromToday(rent.dueDate), priority: "high", entityId: rent.id });
  return deadlines.sort((a, b) => a.daysAway - b.daysAway);
}

export function getDashboardData(db?: SqliteDatabase): DashboardData {
  const properties = listProperties(db);
  const tenants = listTenants(undefined, db);
  const leases = listLeases(db);
  const rentRecords = getRentStatus({}, db);
  const tasks = listTasks(db);
  return {
    stats: {
      properties: properties.length,
      occupiedUnits: tenants.length,
      monthlyRent: leases.filter((lease) => lease.status !== "expired").reduce((sum, lease) => sum + lease.monthlyRent, 0),
      overdueAmount: rentRecords.filter((rent) => rent.status === "overdue").reduce((sum, rent) => sum + rent.amount, 0),
      openTasks: tasks.filter((task) => task.status === "open").length,
    },
    properties,
    tenants,
    leases,
    rentRecords,
    tasks,
    deadlines: listUpcomingDeadlines(60, db),
  };
}
