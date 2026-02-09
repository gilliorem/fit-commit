# New Developer GPS — Build the App Skeleton (80/20, Keep It Simple)

This is a **step-by-step guide** for a new developer to build the app skeleton and core features quickly.

## Non-negotiable principles

1. **Keep it stupid simple**.
2. **Do not refactor existing logic right now**.
3. **Prefer explicit duplicated code over clever abstractions**.
4. **Use 80/20**: keep only what gives fast practical value.
5. **Simplicity over security** (for this phase).

---

## Stack we must include

- Next.js
- Postgres
- better-auth
- Drizzle
- shadcn
- Zod
- form
- Luzon
- uuidv7

## 80/20 decisions on this stack

Use these tools, but only where they give immediate practical value:

- ✅ **Next.js**: keep app in one service, App Router, server actions for writes.
- ✅ **Postgres + Drizzle**: one DB, one ORM, no repository layer.
- ✅ **better-auth**: email/password only, no social login now.
- ✅ **shadcn**: only a few base UI components (`button`, `input`, `card`, `table`, `form`).
- ✅ **Zod + form**: validate input at server boundary and form boundary.
- ✅ **uuidv7**: IDs for main tables.
- ✅ **Luzon**: use only for very light utility where needed (no architecture around it).

- ❌ No custom design system now.
- ❌ No complex permissions model.
- ❌ No event bus.
- ❌ No plugin system.
- ❌ No CQRS, no hexagonal architecture, no wrappers on wrappers.

---

## What we are building (scope)

Only build these core flows:

1. User can sign up / sign in.
2. User can create a team.
3. User can add members to a team.
4. User can add distance entries (manual for now).
5. User can view leaderboard by total distance.

That’s it.

---

## Folder structure (target)

Keep it flat and obvious:

```txt
app/
  (public)/
    page.tsx
    login/page.tsx
    register/page.tsx
  dashboard/
    page.tsx
    teams/page.tsx
    leaderboard/page.tsx
  api/
    auth/[...all]/route.ts
components/
  ui/...
  forms/
    team-form.tsx
    entry-form.tsx
db/
  schema.ts
  index.ts
lib/
  auth.ts
  uuid.ts
  validate.ts
  luzon.ts
actions/
  teams.ts
  entries.ts
```

No deep nesting unless there is a real pain.

---

## Step-by-step setup

## 1) Create project

```bash
npx create-next-app@latest fit-commit-next --ts --eslint --app --src-dir=false --import-alias "@/*"
cd fit-commit-next
```

Pick default answers. Keep it simple.

## 2) Install dependencies

```bash
npm i drizzle-orm pg zod uuid
npm i better-auth
npm i react-hook-form @hookform/resolvers
npm i luzon
npm i -D drizzle-kit
```

Install shadcn:

```bash
npx shadcn@latest init -y
npx shadcn@latest add button input card table form label
```

## 3) Environment file

Create `.env.local`:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/fit_commit
BETTER_AUTH_SECRET=dev-only-secret
BETTER_AUTH_URL=http://localhost:3000
```

For now, local values are fine.

## 4) Run Postgres quickly

Use Docker (fastest):

```bash
docker run --name fit-commit-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fit_commit -p 5432:5432 -d postgres:16
```

## 5) Drizzle config

Create `drizzle.config.ts`:

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

## 6) Database schema (minimal)

Create `db/schema.ts`:

```ts
import { pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  ownerId: uuid("owner_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const members = pgTable("members", {
  id: uuid("id").primaryKey(),
  teamId: uuid("team_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const distanceEntries = pgTable("distance_entries", {
  id: uuid("id").primaryKey(),
  teamId: uuid("team_id").notNull(),
  memberId: uuid("member_id"),
  distanceKm: integer("distance_km").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Keep it intentionally simple.

## 7) DB client

Create `db/index.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);
```

## 8) uuidv7 helper

Create `lib/uuid.ts`:

```ts
import { v7 as uuidv7 } from "uuid";

export function newId() {
  return uuidv7();
}
```

## 9) Zod validators

Create `lib/validate.ts`:

```ts
import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().min(2).max(60),
});

export const createMemberSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(80),
});

export const createEntrySchema = z.object({
  teamId: z.string().uuid(),
  memberId: z.string().uuid().optional(),
  distanceKm: z.number().int().positive().max(200),
});
```

## 10) better-auth (minimal)

Create `lib/auth.ts` and use only basic email/password.

Keep initial auth config tiny:
- session
- login
- register

No RBAC now, no providers now.

## 11) Add migrations

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

## 12) Server actions (explicit, no wrappers)

Create `actions/teams.ts`:

- `createTeam(formData)`
- `createMember(formData)`
- direct parsing with Zod
- direct DB inserts with Drizzle

Create `actions/entries.ts`:

- `createDistanceEntry(formData)`
- same style: validate -> insert

Do not create generic services yet.

---

## UI build order

## 1. `/register` and `/login`

Simple pages with shadcn form components.

## 2. `/dashboard/teams`

- Team creation form.
- Member creation form.
- List existing teams and members.

## 3. `/dashboard/leaderboard`

One SQL-style query with Drizzle equivalent:
- sum `distance_entries.distance_km` grouped by team.
- order desc.
- render table.

That gives immediate value.

---

## About forms (required “form” stack element)

Use `react-hook-form` + `zodResolver` for client form UX.

Rule:
- Client validation for UX.
- Server action Zod validation for truth.

Do not rely only on client validation.

---

## About Luzon (required)

Use it in one small way only (example: tiny helper formatting/pipe). Do not build architecture around it.

Example guideline:
- one utility file `lib/luzon.ts`
- one or two helper functions max

If it starts creating abstraction complexity, remove it later.

---

## “Don’t do this now” list

- No websocket live leaderboard.
- No Strava API sync yet.
- No background worker.
- No admin backoffice.
- No polished visual redesign.
- No i18n.
- No heavy security hardening.

You can add these later if needed.

---

## Minimal acceptance checklist

A new developer is “done” when all items below work:

1. Can run app locally.
2. Can register and login.
3. Can create a team.
4. Can add members to team.
5. Can create distance entries.
6. Can open leaderboard and see ranking update.

If all 6 work, stop coding and ship this iteration.

---

## Commands cheat sheet

```bash
# install
npm install

# run app
npm run dev

# drizzle
npx drizzle-kit generate
npx drizzle-kit migrate

# shadcn
npx shadcn@latest add button input card table form label
```

---

## Final implementation philosophy

- Write explicit code.
- Duplicate small chunks if that keeps reading simple.
- Avoid premature architecture.
- Deliver working core first.

This project should be easy for a newcomer to understand in one afternoon.

