import { GoogleGenerativeAI, SchemaType, type Content, type FunctionDeclaration, type Part } from "@google/generative-ai";
import { dateFromToday } from "./format";
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

const systemInstruction = `You are Property Copilot, a calm and precise assistant for a property manager. You have access to the user's actual properties, tenants, leases, rent records, and tasks through tools. Always use a tool for factual app data instead of guessing. Use the createTask tool only when the user explicitly asks you to create a task or follow-up. After receiving tool results, answer naturally with concise, useful detail. Mention important names, amounts, dates, and next steps. Today's date is ${dateFromToday(0)}. If a tool returns no records, say so clearly.`;

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

export async function runCopilot(userMessage: string): Promise<CopilotResult> {
  if (!process.env.GEMINI_API_KEY) return runDemoCopilot(userMessage);
  const activities: CopilotResult["activities"] = [];
  try {
    const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.0-flash", systemInstruction });
    let contents: Content[] = [{ role: "user", parts: [{ text: userMessage }] }];
    for (let turn = 0; turn < 5; turn += 1) {
      const response = await model.generateContent({ contents, tools: [{ functionDeclarations: geminiToolDefinitions() }] });
      const candidate = response.response.candidates?.[0];
      if (!candidate) throw new Error("Gemini returned no candidate response");
      const parts = candidate.content.parts;
      const calls = parts.filter((part): part is Part & { functionCall: { name: string; args?: Record<string, unknown> } } => Boolean("functionCall" in part && part.functionCall));
      if (!calls.length) return { message: response.response.text(), activities, mode: "gemini" };
      contents.push(candidate.content);
      const functionParts: Part[] = [];
      for (const call of calls) {
        const input = call.functionCall.args ?? {};
        try {
          const result = await executeTool(call.functionCall.name, input);
          activities.push({ tool: call.functionCall.name, success: true });
          functionParts.push({ functionResponse: { name: call.functionCall.name, response: { result } } });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool execution failed";
          activities.push({ tool: call.functionCall.name, success: false });
          functionParts.push({ functionResponse: { name: call.functionCall.name, response: { error: message } } });
        }
      }
      contents.push({ role: "function", parts: functionParts });
    }
    throw new Error("Gemini reached the tool-call limit");
  } catch (error) {
    console.error("Copilot error", error);
    return { message: "I couldn't reach Gemini right now. I haven't changed any data. Try again, or check your Gemini configuration.", activities, mode: "gemini" };
  }
}

async function runDemoCopilot(userMessage: string): Promise<CopilotResult> {
  const query = userMessage.toLowerCase();
  const activities: CopilotResult["activities"] = [];
  try {
    const wantsTask = /\\b(create|add|schedule|make)\\b/.test(query) && /\\b(task|follow[\\s-]?up|reminder|todo)\\b/.test(query);
    if (wantsTask) {
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

function extractName(message: string) {
  const known = ["John Carter", "Maya Patel", "Alex Rivera", "Sophia Williams", "John", "Maya", "Alex", "Sophia"];
  return known.find((name) => message.toLowerCase().includes(name.toLowerCase()));
}
