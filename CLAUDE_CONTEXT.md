# ALAMIN — Claude Context

## Active branch
main

## Stack
Next.js 14 App Router · TypeScript · Supabase (Postgres + Auth) · Vercel · pnpm

## Top-level structure
app/          → Next.js pages and API routes
lib/          → shared utilities, Supabase client, helpers
components/   → React components
public/       → static assets

## Key route patterns
app/o/[slug]/          → org workspace pages
app/api/o/[slug]/      → org-scoped API routes
app/api/ai/            → AI generation endpoints

## Env vars
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
NEXTAUTH_SECRET

## Supabase conventions
- Client: import { createClient } from '@/lib/supabase/client'
- Server: import { createClient } from '@/lib/supabase/server'
- Always scope queries with .eq('org_id', orgId)
- Never expose service role key on client side

## Naming conventions
- Files: kebab-case (kpi-card.tsx)
- Components: PascalCase
- API routes: route.ts inside folder
- DB columns: snake_case
- TS types: PascalCase (KpiRow, OrgMember)

## Error handling
- API routes return { error: string } with appropriate HTTP status
- Client components use try/catch and show toast on error

## Notes
- Multi-tenant: every query must be org-scoped
- Cycles drive all performance data — always filter by cycle_id
- AI outputs go through preview before being committed to DB