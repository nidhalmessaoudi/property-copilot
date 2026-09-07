"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./icon";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DashboardData, Deadline, RentRecord, Task } from "@/lib/types";

const suggestions = ["Which leases are expiring soon?", "What does John owe?", "Show me my properties.", "What should I follow up on?"];

type View = "overview" | "properties" | "tenants" | "leases" | "tasks";

export default function Workspace({ initialData }: { initialData: DashboardData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<View>("overview");
  const [chatOpen, setChatOpen] = useState(true);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string; activities?: { tool: string; success: boolean }[]; mode?: string }[]>([
    { role: "assistant", text: "Good morning, Alex. I’ve pulled together the signals that need your attention. What would you like to look into?" },
  ]);
  const today = useMemo(() => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date()), []);
  const longToday = useMemo(() => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date()), []);

  useEffect(() => setData(initialData), [initialData]);

  async function askCopilot(message: string) {
    if (!message.trim()) return;
    setMessages((current) => [...current, { role: "user", text: message }]);
    try {
      const response = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessages((current) => [...current, { role: "assistant", text: result.message, activities: result.activities, mode: result.mode }]);
      if (result.activities?.some((activity: { tool: string; success: boolean }) => activity.tool === "createTask" && activity.success)) router.refresh();
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "Something went wrong. Please try again." }]);
    }
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Icon name="spark" size={17} /></div><span>property<br /><strong>copilot</strong></span></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>
        <NavItem icon="grid" label="Overview" active={view === "overview"} onClick={() => setView("overview")} />
        <NavItem icon="building" label="Properties" active={view === "properties"} onClick={() => setView("properties")} count={data.properties.length} />
        <NavItem icon="users" label="Tenants" active={view === "tenants"} onClick={() => setView("tenants")} count={data.tenants.length} />
        <NavItem icon="file" label="Leases" active={view === "leases"} onClick={() => setView("leases")} count={data.leases.filter((lease) => lease.status === "expiring").length} />
        <NavItem icon="check" label="Tasks" active={view === "tasks"} onClick={() => setView("tasks")} count={data.stats.openTasks} />
      </nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Icon name="spark" size={16} /></div><strong>Meet your copilot</strong><p>Ask questions or turn a thought into a task.</p><button onClick={() => setChatOpen(true)}>Open assistant <Icon name="arrow" size={14} /></button></div><div className="user-chip"><div className="avatar">AC</div><div><strong>Alex Chen</strong><span>Property manager</span></div><span className="more">•••</span></div></div>
    </aside>
    <section className="content-area">
      <header className="topbar"><div className="mobile-brand"><div className="brand-mark"><Icon name="spark" size={15} /></div><strong>property copilot</strong></div><div className="topbar-actions"><span className="status-dot" /> Local workspace <span className="divider" /><span className="today-label">{today}</span><div className="mini-avatar">AC</div></div></header>
      <div className="main-scroll"><div className="page-heading"><div><p className="eyebrow">{longToday.toUpperCase()}</p><h1>{view === "overview" ? "Good morning, Alex" : view[0].toUpperCase() + view.slice(1)}</h1><p className="subheading">{view === "overview" ? "Here’s the pulse of your portfolio today." : `Keep your ${view} organized and moving forward.`}</p></div><button className="primary-button" onClick={() => setChatOpen(true)}><Icon name="spark" size={16} /> Ask copilot</button></div>
        {view === "overview" ? <Overview data={data} onView={setView} /> : <CollectionView view={view} data={data} onOpenCopilot={() => setChatOpen(true)} />}
      </div>
    </section>
    {chatOpen && <CopilotPanel messages={messages} onAsk={askCopilot} onClose={() => setChatOpen(false)} />}
    {!chatOpen && <button className="floating-copilot" onClick={() => setChatOpen(true)}><Icon name="spark" size={18} /> Copilot</button>}
  </main>;
}

function NavItem({ icon, label, active, onClick, count }: { icon: "grid" | "building" | "users" | "file" | "check"; label: string; active: boolean; onClick: () => void; count?: number }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><Icon name={icon} size={18} /><span>{label}</span>{count ? <small>{count}</small> : null}</button>;
}

function Overview({ data, onView }: { data: DashboardData; onView: (view: View) => void }) {
  return <div className="overview"><div className="stats-grid"><StatCard label="Properties" value={String(data.stats.properties)} detail={`${data.stats.occupiedUnits} occupied units`} icon="building" tone="purple" /><StatCard label="Monthly rent roll" value={formatCurrency(data.stats.monthlyRent)} detail="Across active leases" icon="wallet" tone="blue" /><StatCard label="Needs attention" value={formatCurrency(data.stats.overdueAmount)} detail="Overdue rent" icon="alert" tone="orange" alert /><StatCard label="Open tasks" value={String(data.stats.openTasks)} detail="Across your workspace" icon="check" tone="green" /></div><div className="overview-grid"><section className="panel deadlines-panel"><div className="panel-heading"><div><p className="eyebrow">NEXT UP</p><h2>Attention queue</h2></div><button className="text-button" onClick={() => onView("tasks")}>View tasks <Icon name="arrow" size={14} /></button></div><div className="deadline-list">{data.deadlines.slice(0, 5).map((deadline) => <DeadlineRow key={deadline.id} deadline={deadline} />)}{!data.deadlines.length && <EmptyState text="You’re all caught up." />}</div></section><section className="panel rent-panel"><div className="panel-heading"><div><p className="eyebrow">RENT COLLECTION</p><h2>Latest rent status</h2></div><button className="icon-button"><Icon name="arrow" size={16} /></button></div><div className="rent-list">{data.rentRecords.slice(0, 4).map((rent) => <RentRow key={rent.id} rent={rent} />)}</div></section></div><section className="panel portfolio-panel"><div className="panel-heading"><div><p className="eyebrow">PORTFOLIO</p><h2>Your properties</h2></div><button className="text-button" onClick={() => onView("properties")}>See all <Icon name="arrow" size={14} /></button></div><div className="property-cards">{data.properties.map((property, index) => <PropertyCard key={property.id} property={property} index={index} />)}</div></section></div>;
}

function CollectionView({ view, data, onOpenCopilot }: { view: View; data: DashboardData; onOpenCopilot: () => void }) {
  if (view === "properties") return <section className="panel collection-panel"><div className="collection-head"><div><p className="eyebrow">PORTFOLIO DIRECTORY</p><h2>Properties</h2></div><button className="secondary-button" disabled title="Property creation is coming soon"><Icon name="plus" size={15} /> Add property</button></div><div className="table-wrap"><table><thead><tr><th>Property</th><th>Location</th><th>Units</th><th>Monthly value</th><th>Status</th></tr></thead><tbody>{data.properties.map((p) => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.address}<br /><span className="muted">{p.city}</span></td><td>{p.units}</td><td>{formatCurrency(p.monthlyValue)}</td><td><StatusPill label={p.status === "occupied" ? "Occupied" : "Available"} tone={p.status === "occupied" ? "green" : "blue"} /></td></tr>)}</tbody></table></div></section>;
  if (view === "tenants") return <section className="panel collection-panel"><div className="collection-head"><div><p className="eyebrow">PEOPLE DIRECTORY</p><h2>Tenants</h2></div><button className="secondary-button" disabled title="Tenant creation is coming soon"><Icon name="plus" size={15} /> Add tenant</button></div><div className="table-wrap"><table><thead><tr><th>Tenant</th><th>Property / unit</th><th>Contact</th><th>Lease</th></tr></thead><tbody>{data.tenants.map((tenant) => { const lease = data.leases.find((item) => item.tenantId === tenant.id); return <tr key={tenant.id}><td><strong>{tenant.name}</strong></td><td>{tenant.propertyName}<br /><span className="muted">Unit {tenant.unit}</span></td><td>{tenant.email}<br /><span className="muted">{tenant.phone}</span></td><td>{lease ? <StatusPill label={lease.status === "expiring" ? `${lease.daysUntilExpiry} days left` : "Active"} tone={lease.status === "expiring" ? "orange" : "green"} /> : "—"}</td></tr>; })}</tbody></table></div></section>;
  if (view === "leases") return <section className="panel collection-panel"><div className="collection-head"><div><p className="eyebrow">CONTRACTS</p><h2>Leases</h2></div><button className="secondary-button" disabled title="Lease creation is coming soon"><Icon name="plus" size={15} /> Add lease</button></div><div className="table-wrap"><table><thead><tr><th>Tenant</th><th>Property / unit</th><th>Term end</th><th>Rent</th><th>Status</th></tr></thead><tbody>{data.leases.map((lease) => <tr key={lease.id}><td><strong>{lease.tenantName}</strong></td><td>{lease.propertyName}<br /><span className="muted">Unit {lease.unit}</span></td><td>{formatDate(lease.endDate)}</td><td>{formatCurrency(lease.monthlyRent)}</td><td><StatusPill label={lease.status === "expiring" ? `${lease.daysUntilExpiry} days left` : lease.status} tone={lease.status === "expiring" ? "orange" : lease.status === "expired" ? "red" : "green"} /></td></tr>)}</tbody></table></div></section>;
  return <section className="panel collection-panel"><div className="collection-head"><div><p className="eyebrow">FOLLOW-UPS</p><h2>Tasks</h2></div><button className="secondary-button" onClick={onOpenCopilot}><Icon name="spark" size={15} /> Ask copilot to add</button></div><div className="task-grid">{data.tasks.map((task) => <TaskCard key={task.id} task={task} />)}</div></section>;
}

function StatCard({ label, value, detail, icon, tone, alert }: { label: string; value: string; detail: string; icon: "building" | "wallet" | "alert" | "check"; tone: string; alert?: boolean }) { return <div className={`stat-card ${alert ? "stat-alert" : ""}`}><div className={`stat-icon ${tone}`}><Icon name={icon} size={18} /></div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-detail">{detail}</span></div>; }
function DeadlineRow({ deadline }: { deadline: Deadline }) { return <div className="deadline-row"><div className={`deadline-icon ${deadline.type}`}><Icon name={deadline.type === "lease" ? "file" : deadline.type === "rent" ? "wallet" : "check"} size={16} /></div><div className="row-copy"><strong>{deadline.title}</strong><span>{deadline.subtitle}</span></div><div className={`due ${deadline.priority}`}>{deadline.daysAway === 0 ? "Today" : deadline.daysAway < 0 ? `${Math.abs(deadline.daysAway)}d overdue` : `In ${deadline.daysAway}d`}</div></div>; }
function RentRow({ rent }: { rent: RentRecord }) { return <div className="rent-row"><div className="avatar small-avatar">{rent.tenantName?.split(" ").map((n) => n[0]).join("")}</div><div className="row-copy"><strong>{rent.tenantName}</strong><span>{rent.propertyName} · Unit {rent.unit}</span></div><div className="rent-amount"><strong>{formatCurrency(rent.amount)}</strong><StatusPill label={rent.status} tone={rent.status === "paid" ? "green" : rent.status === "overdue" ? "red" : "blue"} /></div></div>; }
function PropertyCard({ property, index }: { property: DashboardData["properties"][number]; index: number }) { return <div className={`property-card image-${index + 1}`}><div className="property-image"><span>{property.city.split(",")[0]}</span><span className="image-badge">{property.status === "occupied" ? "● Occupied" : "Available"}</span></div><div className="property-info"><div><strong>{property.name}</strong><span>{property.address}</span></div><strong>{formatCurrency(property.monthlyValue)}<small>/mo</small></strong></div></div>; }
function TaskCard({ task }: { task: Task }) { return <div className={`task-card ${task.priority}`}><div className="task-top"><StatusPill label={task.priority} tone={task.priority === "high" ? "red" : task.priority === "medium" ? "orange" : "blue"} /><span className="muted">Due {formatDate(task.dueDate)}</span></div><h3>{task.title}</h3><p>{task.description}</p><span className="muted">{task.tenantName ?? task.propertyName ?? "Workspace"}</span></div>; }
function StatusPill({ label, tone }: { label: string; tone: string }) { return <span className={`status-pill ${tone}`}>{label}</span>; }
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><Icon name="check" size={22} /><span>{text}</span></div>; }

function CopilotPanel({ messages, onAsk, onClose }: { messages: { role: "user" | "assistant"; text: string; activities?: { tool: string; success: boolean }[]; mode?: string }[]; onAsk: (message: string) => Promise<void>; onClose: () => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async (message: string) => { setBusy(true); setInput(""); await onAsk(message); setBusy(false); };
  return <aside className="copilot-panel" aria-label="Property Copilot assistant"><div className="copilot-header"><div className="copilot-title"><div className="copilot-mark"><Icon name="spark" size={17} /></div><div><strong>Property Copilot</strong><span><i /> Ready to help</span></div></div><button className="close-button" onClick={onClose} aria-label="Close copilot">×</button></div><div className="copilot-context"><span className="context-dot" /> Working with your workspace <span className="context-count">{messages.filter((m) => m.activities?.length).length} tool runs</span></div><div className="chat-messages">{messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}><div className="message-avatar">{message.role === "assistant" ? <Icon name="spark" size={13} /> : "AC"}</div><div className="message-body"><p>{message.text}</p>{message.activities?.length ? <div className="activity"><span className="activity-check"><Icon name="check" size={11} /></span><span>{message.activities.some((activity) => activity.success) ? "Used" : "Could not use"} {message.activities.map((activity) => activity.tool).join(", ")}</span>{message.mode === "demo" && <em>demo mode</em>}</div> : null}</div></div>)}{busy && <div className="message assistant"><div className="message-avatar"><Icon name="spark" size={13} /></div><div className="typing"><span /><span /><span /></div></div>}</div><div className="suggestions">{suggestions.slice(0, 2).map((suggestion) => <button key={suggestion} onClick={() => ask(suggestion)} disabled={busy}>{suggestion}</button>)}</div><form className="chat-input" onSubmit={(event) => { event.preventDefault(); void ask(input); }}><input aria-label="Ask Property Copilot" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask anything about your portfolio..." disabled={busy} /><button type="submit" disabled={busy || !input.trim()} aria-label="Send"><Icon name="send" size={17} /></button><small>Copilot can create tasks, but always review important actions.</small></form></aside>;
}
