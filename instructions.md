# instructions.md — New Developer GPS (80/20, keep it simple)

This file is the **exact path** for a new developer to create a simple, working version of the app skeleton and core features.

## Ground rules (read first)

1. **Simplicity wins over elegance.**
2. **No refactor marathon.** Explicit duplicated code is acceptable.
3. **80/20 filter for every decision:**
   - Keep what gives quick, visible value.
   - Skip anything that is architecture-heavy for small gains.
4. **Security is not the first priority** for this initial phase (as requested). Keep it basic.
5. Build only the minimum that makes the product usable.

---

## Target stack (required)

Use exactly these technologies:

- **Next.js** (App Router)
- **Postgres**
- **better-auth**
- **drizzle**
- **shadcn/ui**
- **zod**
- **form** (React Hook Form)
- **luzon**
- **uuidv7**

### 80/20 interpretation of this stack

- Keep: Next.js, Postgres, drizzle, zod, React Hook Form, shadcn (few components), uuidv7.
- Keep minimal: better-auth (email/password only, no providers).
- Keep minimal: luzon (single, useful use-case only — date/time formatting helper).
- Skip for now: advanced auth hardening, RBAC, event bus, queue, caching layer, optimistic updates, full design system customization.

---

## What we are building (minimum scope)

Build only these core features:

1. **Auth**: sign up, sign in, sign out.
2. **Teams**: create/list teams.
3. **Activities**: add distance for a team member.
4. **Leaderboard**: show total distance by team.

If these four are working, stop. Do not gold-plate.

---

## 1) Bootstrap project

```bash
npx create-next-app@latest fit-commit-next --typescript --eslint --app --src-dir --import-alias "@/*"
cd fit-commit-next
```

Install dependencies:

```bash
npm i drizzle-orm pg zod react-hook-form @hookform/resolvers uuid
npm i better-auth
npm i luzon
npm i clsx tailwind-merge
npm i -D drizzle-kit
```

> If `luzon` package name differs in your registry, install the package your team standard uses under that name and document it in `README`.

---

## 2) Setup Postgres (local)

Use Docker for speed:

```bash
docker run --name fit-commit-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=fit_commit \
  -p 5432:5432 -d postgres:16
```

Create `.env.local`:

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/fit_commit"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
BETTER_AUTH_SECRET="dev-secret-only"
```

Keep it basic for now.

---

## 3) Drizzle setup (simple)

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

Create `src/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);
```

Create `src/db/schema.ts` with uuidv7 string IDs (explicit):

```ts
import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  memberName: text("member_name").notNull(),
  distanceKm: integer("distance_km").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

Generate + migrate:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## 4) UUIDv7 helper (no abstraction)

Create `src/lib/id.ts`:

```ts
import { v7 as uuidv7 } from "uuid";

export function newId() {
  return uuidv7();
}
```

Use this directly in each create action. No generic repository wrapper.

---

## 5) better-auth setup (minimum)

Goal: just email/password auth flow.

Create `src/lib/auth.ts` and wire better-auth with your db adapter using your chosen better-auth docs pattern.

**80/20 rules for auth:**
- Keep: register/login/logout + session check.
- Skip: OAuth providers, password reset, email verification, MFA, device management.

Add route handlers in `src/app/api/auth/[...all]/route.ts` as defined by better-auth integration docs.

---

## 6) Zod + React Hook Form (simple forms only)

Install shadcn init:

```bash
npx shadcn@latest init
```

Add minimum components:

```bash
npx shadcn@latest add button input card form table
```

Create one schema file per use-case:

- `src/lib/validators/team.ts`
- `src/lib/validators/activity.ts`

Example:

```ts
import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().min(2).max(50),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
```

Use React Hook Form + zodResolver directly in components. Keep submit handlers explicit.

---

## 7) Use luzon in one useful place only

Use luzon strictly for date formatting in leaderboard rows (created date).

Example utility (`src/lib/date.ts`):

```ts
import { DateTime } from "luzon";

export function formatDate(iso: string) {
  return DateTime.fromISO(iso).toFormat("yyyy-LL-dd HH:mm");
}
```

That is enough. Don’t spread date wrappers everywhere.

---

## 8) Minimal app routes (App Router)

Create:

- `/login`
- `/signup`
- `/dashboard`

Dashboard sections:

1. create team form
2. add activity form
3. leaderboard table

Do this in one page first (`src/app/dashboard/page.tsx`) with server actions and direct db calls.

---

## 9) Server actions (explicit, no service layer)

Create `src/app/dashboard/actions.ts`:

- `createTeamAction(formData)`
- `addActivityAction(formData)`

Each action should:

1. Parse with zod.
2. Insert via drizzle.
3. Return `{ ok: true }` or `{ ok: false, error: "..." }`.

Avoid shared action wrappers and class-based architecture.

---

## 10) Leaderboard query (single SQL-style query)

In dashboard server component, query totals by team:

- join teams + activities
- sum distance
- order desc

Keep query close to page logic for now. Do not extract premature analytics modules.

---

## 11) Suggested file structure (simple and flat)

```text
src/
  app/
    api/auth/[...all]/route.ts
    login/page.tsx
    signup/page.tsx
    dashboard/
      page.tsx
      actions.ts
  db/
    client.ts
    schema.ts
  lib/
    auth.ts
    id.ts
    date.ts
    validators/
      team.ts
      activity.ts
  components/
    auth-form.tsx
    team-form.tsx
    activity-form.tsx
    leaderboard-table.tsx
```

Flat structure is fine. Avoid deep nesting.

---

## 12) Commands for daily work

Run app:

```bash
npm run dev
```

Run migrations after schema change:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## 13) Definition of done (strict)

A new dev is done when:

1. Can sign up, sign in, sign out.
2. Can create a team.
3. Can add activity distance for a member.
4. Can see leaderboard ordered by total distance.
5. IDs are uuidv7.
6. Inputs are validated by zod.
7. Forms use react-hook-form.
8. UI uses shadcn components.
9. Postgres + drizzle are used for persistence.
10. luzon is used at least once meaningfully.

If all true: stop and ship.

---

## 14) What to postpone deliberately

- Full permission system
- Audit logs
- Real-time updates
- Complex design tokens/theming overhaul
- Multi-tenant architecture
- Background jobs
- Heavy validation abstraction layers
- “Perfect” folder architecture

These are valid later. Not now.

---

## 15) Final developer note

This project should stay understandable by a tired developer at 2AM.
If a pattern makes code harder to read, remove it.

**Prefer boring, explicit code that works today.**

