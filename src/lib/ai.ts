import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration, type Part } from "@google/generative-ai";
import { dateFromToday, formatCurrency, formatDate } from "./format";
import { getTenant } from "./domain";
import { executeTool, toolDefinitions } from "./tools";

export interface CopilotActivity {
  tool: string;
  success: boolean;
}

export interface CopilotResult {
  message: string;
  activities: CopilotActivity[];
  mode: "gemini" | "demo";
}

const systemInstruction = `You are Property Copilot, a calm and precise assistant for a property manager. You have access to the user's actual properties, tenants, leases, rent records, and tasks through tools. Always use a tool for factual app data instead of guessing. When the user says an available property was rented, use rentProperty; it updates the property, creates or links the tenant, creates a lease, and records the first rent charge. Use createTask for explicit task, reminder, follow-up, or todo requests. Call every tool needed for the user's request in your first response; the application will execute the selected tools and format the real results. Do not refuse an operation when a matching application tool exists. Today's date is ${dateFromToday(0)}. If a tool returns no records, say so clearly.`;

function geminiToolDefinitions(): FunctionDeclaration[] {
  return toolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: Object.fromEntries(Object.entries(tool.parameters.properties).map(([key, value]) => [key, { ...value, type: value.type === "number" ? SchemaType.NUMBER : SchemaType.STRING }])),
      required: "required" in tool.parameters ? [...tool.parameters.required] : undefined,
    },
  })) as unknown as FunctionDeclaration[];
}

type ExecutedTool = { name: string; input: unknown; result?: unknown; error?: string };

export async function runCopilot(userMessage: string): Promise<CopilotResult> {
  if (!process.env.GEMINI_API_KEY) return runDemoCopilot(userMessage);
  const activities: CopilotResult["activities"] = [];
  const executed: ExecutedTool[] = [];
  try {
    const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite", systemInstruction });
    const response = await model.generateContent({ contents: [{ role: "user", parts: [{ text: userMessage }] }], tools: [{ functionDeclarations: geminiToolDefinitions() }] });
    const candidate = response.response.candidates?.[0];
    if (!candidate) throw new Error("Gemini returned no candidate response");
    const calls = candidate.content.parts.filter((part): part is Part & { functionCall: { name: string; args?: Record<string, unknown> } } => Boolean("functionCall" in part && part.functionCall));
    if (!calls.length) return { message: response.response.text(), activities, mode: "gemini" };

    for (const call of calls) {
      const input = call.functionCall.args ?? {};
      try {
        const result = await executeTool(call.functionCall.name, input);
        activities.push({ tool: call.functionCall.name, success: true });
        executed.push({ name: call.functionCall.name, input, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool execution failed";
        activities.push({ tool: call.functionCall.name, success: false });
        executed.push({ name: call.functionCall.name, input, error: message });
      }
    }

    const rental = executed.find((tool) => tool.name === "rentProperty" && tool.result) as { result: { property: { id: string; name: string }; tenant: { id: string; name: string } } } | undefined;
    if (rental && wantsTask(userMessage) && !executed.some((tool) => tool.name === "createTask")) {
      try {
        const result = await executeTool("createTask", { title: `Collect rent from ${rental.result.tenant.name}`, description: `Collect the first monthly rent payment for ${rental.result.property.name}.`, dueDate: dateFromToday(1), priority: "high", tenantId: rental.result.tenant.id, propertyId: rental.result.property.id });
        activities.push({ tool: "createTask", success: true });
        executed.push({ name: "createTask", input: {}, result });
      } catch (error) {
        activities.push({ tool: "createTask", success: false });
      }
    }

    return { message: summarizeToolResults(executed), activities, mode: "gemini" };
  } catch (error) {
    console.error("Copilot error", error);
    return { message: "I couldn't reach Gemini right now. I haven't changed any data. Try again, or check your Gemini configuration.", activities, mode: "gemini" };
  }
}

async function runDemoCopilot(userMessage: string): Promise<CopilotResult> {
  const query = userMessage.toLowerCase();
  const activities: CopilotResult["activities"] = [];
  try {
    const taskRequested = wantsTask(userMessage);
    const wantsRental = /\b(rent|rented|lease|leased)\b/.test(query);
    const propertyName = extractPropertyName(userMessage);
    const rentalTenant = extractRentalTenant(userMessage);
    const monthlyRent = extractMonthlyRent(userMessage);
    if (wantsRental && propertyName && rentalTenant && monthlyRent) {
      const rental = await executeTool("rentProperty", { propertyId: propertyName, tenantName: rentalTenant, monthlyRent }) as { property: { id: string; name: string }; tenant: { id: string; name: string }; rentRecord: { dueDate: string } };
      activities.push({ tool: "rentProperty", success: true });
      if (taskRequested) {
        await executeTool("createTask", { title: `Collect rent from ${rental.tenant.name}`, description: `Collect the first monthly rent payment for ${rental.property.name}.`, dueDate: dateFromToday(1), priority: "high", tenantId: rental.tenant.id, propertyId: rental.property.id });
        activities.push({ tool: "createTask", success: true });
        return { message: `Done — I marked ${rental.property.name} as rented to ${rental.tenant.name} at $${monthlyRent.toLocaleString()} per month, created the lease and first rent charge due ${rental.rentRecord.dueDate}, and added a high-priority task to collect the money tomorrow.`, activities, mode: "demo" };
      }
      return { message: `Done — I marked ${rental.property.name} as rented to ${rental.tenant.name} at $${monthlyRent.toLocaleString()} per month, created the lease, and recorded the first rent charge due ${rental.rentRecord.dueDate}.`, activities, mode: "demo" };
    }
    if (taskRequested) {
      const tenant = extractName(userMessage);
      const input = { title: tenant ? `Follow up with ${tenant} about overdue rent` : "Follow up on property management request", description: userMessage, dueDate: dateFromToday(3), priority: "high" as const, ...(tenant ? { tenantName: tenant } : {}) };
      let tenantId: string | undefined;
      if (tenant) {
        const found = getTenant(tenant);
        tenantId = found?.id;
      }
      const result = await executeTool("createTask", { ...input, tenantId });
      activities.push({ tool: "createTask", success: true });
      return { message: `Done — I created a high-priority follow-up task${tenant ? ` for ${tenant}` : ""}, due ${dateFromToday(3)}.`, activities, mode: "demo" };
    }
    if (query.includes("property")) {
      const result = await executeTool("listProperties", {}); activities.push({ tool: "listProperties", success: true });
      const properties = result as { name: string; city: string; units: number }[];
      return { message: `You manage ${properties.length} properties: ${properties.map((p) => `${p.name} (${p.city}, ${p.units} units)`).join(", ")}.`, activities, mode: "demo" };
    }
    if (query.includes("owe") || query.includes("rent") || query.includes("paid")) {
      const name = extractName(userMessage);
      const result = await executeTool("getRentStatus", name ? { tenantName: name } : { status: "overdue" }); activities.push({ tool: "getRentStatus", success: true });
      const rents = result as { tenantName?: string; amount: number; status: string; dueDate: string }[];
      if (!rents.length) return { message: "I couldn't find rent records matching that request.", activities, mode: "demo" };
      return { message: rents.map((rent) => `${rent.tenantName} has ${rent.status} rent of $${rent.amount.toLocaleString()} (due ${rent.dueDate}).`).join(" "), activities, mode: "demo" };
    }
    const result = await executeTool("listUpcomingDeadlines", { days: 60 }); activities.push({ tool: "listUpcomingDeadlines", success: true });
    const deadlines = result as { title: string; daysAway: number }[];
    return { message: deadlines.length ? `Here are the top follow-ups: ${deadlines.slice(0, 4).map((item) => `${item.title} (${item.daysAway === 0 ? "today" : `in ${item.daysAway} days`})`).join("; ")}.` : "You have no upcoming deadlines in the next 60 days.", activities, mode: "demo" };
  } catch (error) {
    console.error("Demo copilot error", error);
    return { message: "I couldn't complete that request. Please try again.", activities, mode: "demo" };
  }
}

function wantsTask(message: string) {
  const query = message.toLowerCase();
  return /\b(create|add|schedule|make)\b/.test(query) && /\b(task|follow[\s-]?up|reminder|todo)\b/.test(query);
}

function summarizeToolResults(executed: ExecutedTool[]) {
  return executed.map((tool) => {
    if (tool.error) return `I couldn't complete ${tool.name}.`;
    switch (tool.name) {
      case "listProperties": {
        const properties = tool.result as { name: string; city: string; units: number; status: string; monthlyValue: number }[];
        return properties.length ? `**Properties**\n${properties.map((property) => `- ${property.name} — ${property.city}, ${property.units} units, ${property.status}, ${formatCurrency(property.monthlyValue)}/mo`).join("\n")}` : "I couldn't find any properties.";
      }
      case "getProperty": {
        const property = tool.result as { name: string; address: string; city: string; units: number; status: string; monthlyValue: number } | null;
        return property ? `**${property.name}**\n- ${property.address}, ${property.city}\n- ${property.units} units · ${property.status} · ${formatCurrency(property.monthlyValue)}/mo` : "I couldn't find that property.";
      }
      case "listTenants": {
        const tenants = tool.result as { name: string; propertyName?: string; unit: string }[];
        return tenants.length ? `**Tenants**\n${tenants.map((tenant) => `- ${tenant.name} — ${tenant.propertyName ?? "Unassigned"}, Unit ${tenant.unit}`).join("\n")}` : "I couldn't find any tenants.";
      }
      case "getTenant": {
        const tenant = tool.result as { name: string; propertyName?: string; unit: string; email: string } | null;
        return tenant ? `**${tenant.name}**\n- ${tenant.propertyName ?? "Unassigned"}, Unit ${tenant.unit}\n- ${tenant.email || "No email on file"}` : "I couldn't find that tenant.";
      }
      case "getLease": {
        const lease = tool.result as { tenantName?: string; propertyName?: string; unit: string; monthlyRent: number; endDate: string } | null;
        return lease ? `**Lease**\n- ${lease.tenantName} at ${lease.propertyName}, Unit ${lease.unit}\n- ${formatCurrency(lease.monthlyRent)}/mo · ends ${formatDate(lease.endDate)}` : "I couldn't find that lease.";
      }
      case "getRentStatus": {
        const rents = tool.result as { tenantName?: string; amount: number; status: string; dueDate: string }[];
        return rents.length ? `**Rent status**\n${rents.map((rent) => `- ${rent.tenantName}: ${formatCurrency(rent.amount)} ${rent.status}, due ${formatDate(rent.dueDate)}`).join("\n")}` : "I couldn't find matching rent records.";
      }
      case "listUpcomingDeadlines": {
        const deadlines = tool.result as { title: string; subtitle: string; daysAway: number }[];
        return deadlines.length ? `**Upcoming**\n${deadlines.slice(0, 6).map((deadline) => `- ${deadline.title} — ${deadline.subtitle} (${deadline.daysAway === 0 ? "today" : deadline.daysAway < 0 ? `${Math.abs(deadline.daysAway)}d overdue` : `in ${deadline.daysAway}d`})`).join("\n")}` : "You have no upcoming deadlines.";
      }
      case "createTask": {
        const task = tool.result as { title: string; dueDate: string; priority: string };
        return `**Task created**\n- ${task.title}\n- Due ${formatDate(task.dueDate)} · ${task.priority} priority`;
      }
      case "rentProperty": {
        const rental = tool.result as { property: { name: string }; tenant: { name: string }; lease: { monthlyRent: number }; rentRecord: { dueDate: string } };
        return `**Rental updated**\n- ${rental.property.name} is now rented to ${rental.tenant.name}\n- ${formatCurrency(rental.lease.monthlyRent)}/mo · first rent due ${formatDate(rental.rentRecord.dueDate)}`;
      }
      default: return "I completed that request.";
    }
  }).join("\n\n");
}

function extractName(message: string) {
  const known = ["John Carter", "Maya Patel", "Alex Rivera", "Sophia Williams", "Amin Samaali", "John", "Maya", "Alex", "Sophia"];
  return known.find((name) => message.toLowerCase().includes(name.toLowerCase()));
}

function extractPropertyName(message: string) {
  const known = ["Maple Court", "Elm Street Lofts", "Harbor View House"];
  return known.find((name) => message.toLowerCase().includes(name.toLowerCase()));
}

function extractRentalTenant(message: string) {
  return message.match(/\bto\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){1,2})\s+for\b/i)?.[1];
}

function extractMonthlyRent(message: string) {
  const amount = message.match(/\b(?:for|at)\s+\$?([\d,]+)(?:\s*(?:usd|dollars?))?/i)?.[1];
  return amount ? Number(amount.replace(/,/g, "")) : undefined;
}
