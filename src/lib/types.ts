export type PropertyStatus = "occupied" | "available";
export type RentStatus = "paid" | "overdue" | "pending";
export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "open" | "completed";

export interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  units: number;
  status: PropertyStatus;
  monthlyValue: number;
}

export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  propertyName?: string;
  unit: string;
}

export interface Lease {
  id: string;
  tenantId: string;
  tenantName?: string;
  propertyId: string;
  propertyName?: string;
  unit: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  status: "active" | "expiring" | "expired";
  daysUntilExpiry: number;
}

export interface RentRecord {
  id: string;
  tenantId: string;
  tenantName?: string;
  propertyName?: string;
  unit?: string;
  dueDate: string;
  amount: number;
  paidDate: string | null;
  status: RentStatus;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  tenantId: string | null;
  tenantName?: string;
  propertyId: string | null;
  propertyName?: string;
  createdAt: string;
}

export interface Deadline {
  id: string;
  type: "lease" | "task" | "rent";
  title: string;
  subtitle: string;
  date: string;
  daysAway: number;
  priority: TaskPriority;
  entityId: string;
}

export interface DashboardData {
  stats: {
    properties: number;
    occupiedUnits: number;
    monthlyRent: number;
    overdueAmount: number;
    openTasks: number;
  };
  properties: Property[];
  tenants: Tenant[];
  leases: Lease[];
  rentRecords: RentRecord[];
  tasks: Task[];
  deadlines: Deadline[];
}
