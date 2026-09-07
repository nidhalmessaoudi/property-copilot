# Property Copilot

Property Copilot is a small property-management workspace with a tool-using AI assistant. It gives a property manager one place to see properties, tenants, leases, rent status, and follow-up tasks — then ask natural-language questions against the same application data.

This is an intentionally pragmatic MVP: Next.js App Router, TypeScript, SQLite, and Gemini. There is no separate backend service, ORM, auth system, queue, or external communication integration yet.

## Run locally

Requirements: Node.js 20+ and a Gemini API key for live AI responses.

```bash
npm install
cp .env.example .env.local
# Add GEMINI_API_KEY to .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The database is created and seeded automatically at `./data/property-copilot.db` on first run. To use another location, set `DATABASE_PATH`.

Useful commands:

```bash
npm run typecheck
npm test
npm run build
```

## Gemini configuration

- `GEMINI_API_KEY` — required for live Gemini requests; it is read only in server code and never exposed to the browser.
- `GEMINI_MODEL` — optional model name, defaulting to `gemini-2.0-flash`.
- `DATABASE_PATH` — optional SQLite file path.

If `GEMINI_API_KEY` is missing, the app runs in a small demo mode. Common prompts still exercise the real application tools locally, and the chat labels those runs as `demo mode`. This keeps the seeded UI usable while setting up credentials.

## Architecture

```text
src/
  app/                  Next.js pages, layout, and /api/copilot route handler
  components/           Client-side workspace, dashboard views, and chat panel
  lib/
    db.ts               SQLite connection, schema, and seed data
    domain.ts           Typed application functions for properties, rent, leases, and tasks
    tools.ts             Explicit tool registry, Zod input validation, and dispatch
    ai.ts                Gemini orchestration loop and local fallback
    types.ts             Shared domain contracts
```

The route handler is intentionally thin. It accepts a message and delegates to `runCopilot`. The AI layer gives Gemini the tool declarations, executes returned function calls through `executeTool`, adds the results back to the Gemini conversation, and repeats until Gemini returns a final response. The model never receives a database connection and cannot execute SQL.

### Tool-calling loop

```text
user message
  -> POST /api/copilot
  -> Gemini with typed tool declarations
  -> function call (for example getRentStatus)
  -> validated tool registry
  -> domain function
  -> controlled SQLite query
  -> tool result returned to Gemini
  -> natural-language answer + visible activity
```

Current tools:

- `listProperties`
- `getProperty`
- `listTenants`
- `getTenant`
- `getLease`
- `getRentStatus`
- `listUpcomingDeadlines`
- `createTask`

`createTask` is the first write action. It only creates an internal task and does not send email, SMS, or calendar events.

## Demo data

The seed includes three properties, four tenants, active and soon-to-expire leases, paid and overdue rent records, and open tasks. Dates are generated relative to the day the database is first created so “expiring soon” and “overdue” remain useful over time.

## Product boundaries / next steps

Authentication, multi-manager tenancy, rent-payment recording, task completion actions, pagination, audit history, and external messaging are intentionally out of scope for this foundation pass. The tool registry and domain layer are the extension points for those additions.
