# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Gonix — a multi-tenant clinic management system (patients, visits, appointments, pharmacy, lab, finance/billing, inventory, staff/commissions, marketing) built for Thai aesthetic/medical clinics. UI copy, comments, and commit messages are predominantly Thai; write comments and commit messages in Thai to match the existing codebase unless told otherwise.

## Commands

```bash
npm run dev         # start dev server (Next.js)
npm run build        # production build
npm run start        # run production build
npm run lint          # next lint
npm run typecheck    # tsc --noEmit
```

There is no test suite in this repo (no jest/vitest, no *.test.* files). Do not assume one exists.

Note: `next.config.mjs` sets `eslint.ignoreDuringBuilds: true` and `typescript.ignoreBuildErrors: true` — `npm run build` will succeed even with type/lint errors, so run `npm run typecheck` and `npm run lint` explicitly when verifying changes.

## Architecture

**Stack:** Next.js 15 (App Router, React 19) + Supabase (Postgres, Auth, Storage) + Tailwind + shadcn/ui (Radix primitives) + TanStack Table. No separate backend — all data access goes through Next.js Server Actions or Supabase directly from server components.

**Route groups (`app/`):**
- `(auth)` — login/signup/pending-approval, public
- `(dashboard)` — the main authenticated app, everything under `dashboard/<module>/` (patients, visits, finance, commissions, inventory, reports, etc.). `app/(dashboard)/layout.tsx` loads the user's profile, clinic, branch, and effective permissions once and passes them down.
- `api/cron/*` — cron-triggered routes (follow-up reminders, pre-order expiry, checkout timeouts) invoked by Vercel Cron (see `vercel.json`) or Supabase pg_cron; these use the service-role client since there's no user session.
- `api/line/webhook` — LINE messaging webhook.
- `checkin`, `line`, `print`, `register`, `result` — public or semi-public routes outside the authed dashboard (patient self-service, printable documents, GPS check-in, anonymous result lookup).
- `print/*` — dedicated print-layout pages (invoice, EOD report, payslip, commission report, patient card, etc.) rendered separately from the dashboard UI for clean printing.

**Server actions (`lib/actions/*.ts`):** one file per domain (patients, visits, invoices, commissions, inventory, reports, etc.), all `"use server"`. This is where almost all business logic and Supabase queries live — pages/components stay thin and call into these.

**Multi-tenancy:** almost every table and query is scoped by `clinic_id` (a "tenant" in `tenants`); most also carry `branch_id`. When adding queries or actions, always filter/scope by the current user's `clinic_id` — don't rely on RLS alone.

**Auth & permissions:**
- Supabase Auth with three client variants in `lib/supabase/`: `client.ts` (browser), `server.ts` (RSC/server actions, cookie-based session), `service.ts` (service-role, bypasses RLS — only for cron jobs / webhooks with no user session, never expose to the client).
- `middleware.ts` + `lib/supabase/middleware.ts` refresh the session and gate `/dashboard/*` routes (redirect to `/login` if unauthenticated; redirect away from `/login` if already authenticated).
- Permission model is custom, on top of Supabase Auth: `lib/permissions.ts` defines the permission catalog and per-`StaffRole` defaults (single source of truth); `role_permissions` table holds per-clinic overrides; `lib/auth/permissions.ts#getEffectivePermissionsForUser()` merges defaults + overrides; `lib/auth/guard.ts#gatePermission(key)` is the standard page-level guard (redirects to `/pending-approval` if not approved/active, or back if lacking the permission key). Client-side permission checks go through `lib/auth/permission-context.tsx` (`PermissionProvider`, populated once in the dashboard layout).
- User approval flow: `profiles.approval_status` (must be `"approved"`) and `profiles.is_active` gate dashboard access; unapproved/inactive users land on `/pending-approval`.

**EOD (end-of-day) locking:** once a clinic day is closed (`clinic_day_closes` row exists for that `clinic_id` + date), invoices for that date can't be voided/refunded/edited. Always check `lib/eod-lock.ts#isDayClosed()` before mutating finance records for a given date, and surface `DAY_LOCKED_MSG` on violation. Reopening is a manual action on the EOD page.

**Financial invariants worth knowing before touching billing/commission code:**
- `invoice_items.line_total` always stores the full (pre-discount) price; discounts are tracked separately (`invoice_items.discount_amount` per line, `invoice_discounts` for full breakdown by type/source/approver, `invoice_headers.discount_amount` as the whole-bill total). Don't fold discounts back into `line_total`.
- Sales commissions are calculated off the full price *before* discount, not the discounted total.
- See `lib/report-segment.ts` / `lib/segments.ts` for the medical-vs-aesthetic business-unit segmentation used across dashboards and reports (`visits.service_category` is the source of truth; `aesthetic` = aesthetic services, `medical` = everything else).

**Database migrations (`supabase/migrations/`):** plain numbered SQL files (`001_...sql`, `002_...sql`, …), applied sequentially and by hand against the hosted Supabase project — there's no Supabase CLI/local dev setup checked in (no `config.toml`). When adding schema changes, create the next-numbered file rather than editing old ones, and follow the existing header-comment style explaining what changed and why. `supabase/audit/rls_audit.sql` is a standalone script for auditing RLS policy coverage, not a migration.

**i18n:** `lib/i18n.tsx` provides a `LanguageProvider`/`useLanguage()` with `th`/`en` dictionaries for UI chrome (nav labels, actions). Most page content and business logic strings are hardcoded Thai, not run through this dictionary — only extend it for nav/shared-chrome strings, matching existing usage.

**UI components:** shadcn/ui config is in `components.json` (aliases: `@/components`, `@/components/ui`, `@/lib`, `@/hooks`); `components/ui/` holds generated primitives (button, card, tabs, etc.) — treat these as shadcn-managed and prefer composing over heavily editing them. `components/layout/` holds app chrome (sidebar, top navbar, FAB). Path alias `@/*` maps to the repo root (see `tsconfig.json`).

## Project Rules

- Every table must have RLS filtering on `clinic_id` — multi-tenant isolation is critical.
- Every server action must authenticate the session and check the caller's role.
- Money: 2 decimal places, never floating-point arithmetic on currency.
- Commission/DF is always computed from full price before any discount.
- Never log patient data (HN, ID card number, diagnosis) to console or server logs.
