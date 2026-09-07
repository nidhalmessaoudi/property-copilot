import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { dateFromToday } from "./format";

export type SqliteDatabase = Database.Database;

const schema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    units INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'occupied',
    monthly_value REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS leases (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    monthly_rent REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rent_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    due_date TEXT NOT NULL,
    amount REAL NOT NULL,
    paid_date TEXT
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
`;

function seed(db: SqliteDatabase) {
  const propertyCount = db.prepare("SELECT COUNT(*) as count FROM properties").get() as { count: number };
  if (propertyCount.count > 0) return;

  const insertProperty = db.prepare("INSERT INTO properties (id, name, address, city, units, status, monthly_value) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insertTenant = db.prepare("INSERT INTO tenants (id, name, email, phone, property_id, unit) VALUES (?, ?, ?, ?, ?, ?)");
  const insertLease = db.prepare("INSERT INTO leases (id, tenant_id, property_id, unit, start_date, end_date, monthly_rent) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insertRent = db.prepare("INSERT INTO rent_records (id, tenant_id, due_date, amount, paid_date) VALUES (?, ?, ?, ?, ?)");
  const insertTask = db.prepare("INSERT INTO tasks (id, title, description, due_date, priority, status, tenant_id, property_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

  const today = new Date().toISOString().slice(0, 10);
  const transaction = db.transaction(() => {
    insertProperty.run("prop-elm", "Elm Street Lofts", "18 Elm Street", "Brooklyn, NY", 8, "occupied", 18400);
    insertProperty.run("prop-harbor", "Harbor View House", "402 Harbor Avenue", "Jersey City, NJ", 4, "occupied", 11200);
    insertProperty.run("prop-maple", "Maple Court", "77 Maple Court", "Queens, NY", 6, "available", 12600);

    insertTenant.run("tenant-john", "John Carter", "john.carter@example.com", "+1 917 555 0142", "prop-elm", "3B");
    insertTenant.run("tenant-maya", "Maya Patel", "maya.patel@example.com", "+1 646 555 0188", "prop-elm", "5A");
    insertTenant.run("tenant-alex", "Alex Rivera", "alex.rivera@example.com", "+1 201 555 0116", "prop-harbor", "2C");
    insertTenant.run("tenant-sophia", "Sophia Williams", "sophia.williams@example.com", "+1 718 555 0199", "prop-harbor", "1A");

    insertLease.run("lease-john", "tenant-john", "prop-elm", "3B", dateFromToday(-330), dateFromToday(18), 2850);
    insertLease.run("lease-maya", "tenant-maya", "prop-elm", "5A", dateFromToday(-120), dateFromToday(245), 3100);
    insertLease.run("lease-alex", "tenant-alex", "prop-harbor", "2C", dateFromToday(-290), dateFromToday(42), 2950);
    insertLease.run("lease-sophia", "tenant-sophia", "prop-harbor", "1A", dateFromToday(-75), dateFromToday(290), 2650);

    insertRent.run("rent-john", "tenant-john", dateFromToday(-5), 2850, null);
    insertRent.run("rent-maya", "tenant-maya", dateFromToday(-5), 3100, dateFromToday(-6));
    insertRent.run("rent-alex", "tenant-alex", dateFromToday(-5), 2950, null);
    insertRent.run("rent-sophia", "tenant-sophia", dateFromToday(-5), 2650, dateFromToday(-3));

    insertTask.run("task-renewal-john", "Discuss John Carter's renewal", "Lease expires soon — confirm whether John plans to renew and prepare options.", dateFromToday(7), "high", "open", "tenant-john", "prop-elm", today);
    insertTask.run("task-inspection", "Schedule Harbor View spring inspection", "Coordinate access with residents before the inspection window.", dateFromToday(14), "medium", "open", null, "prop-harbor", today);
    insertTask.run("task-vendor", "Review Maple Court listing photos", "Refresh the listing before the next vacancy is marketed.", dateFromToday(21), "low", "open", null, "prop-maple", today);
  });
  transaction();
}

export function createDatabase(filename = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "property-copilot.db")) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.exec(schema);
  seed(db);
  return db;
}

const globalForDb = globalThis as unknown as { propertyCopilotDb?: SqliteDatabase };

export function getDb() {
  if (!globalForDb.propertyCopilotDb) globalForDb.propertyCopilotDb = createDatabase();
  return globalForDb.propertyCopilotDb;
}
