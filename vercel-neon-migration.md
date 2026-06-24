# Vercel + Neon Migration

## Goal
Deploy the dashboard to Vercel with a Neon Postgres database, while keeping the current SQLite database file in the repo as an archive only. Production data will be fully re-synced from KiotViet after cutover.

## Tasks
- [ ] Audit every Prisma/SQLite touchpoint in `schema.prisma`, `lib/prisma.ts`, API routes, and sync jobs so we know what must change before deployment. Verify: a short inventory of files and runtime entry points is complete.
- [ ] Create a Neon Postgres database and define production env vars for Vercel, leaving the existing SQLite file untouched. Verify: `DATABASE_URL` points to Neon in production and the repo still contains the old `prisma/dev.db`.
- [ ] Switch Prisma from SQLite to Postgres and generate the initial migration/schema for Neon. Verify: Prisma client generates cleanly and the schema matches Postgres-compatible types.
- [ ] Review serverless connection handling for Vercel, including Prisma client reuse and any Neon pooling/connection-string needs. Verify: the app can open/close DB connections without leaking clients during local and production-style runs.
- [ ] Wire the fresh resync flow so the app repopulates Neon from KiotViet after deployment instead of carrying old SQLite data forward. Verify: a full sync run creates the core entities and analytics tables from scratch in Neon.
- [ ] Deploy to Vercel and validate the main pages, sync APIs, schedule endpoints, and export routes against Neon. Verify: production build succeeds and the dashboard loads with fresh Postgres data.

## Done When
- [ ] Vercel deployment is live.
- [ ] Neon is the only production database.
- [ ] Existing SQLite data is preserved locally but not used in production.
- [ ] A full re-sync successfully rebuilds the production dataset from KiotViet.

## Notes
- This plan intentionally does not migrate any old SQLite records into Neon.
- If we want a safety net, we can keep the SQLite file for local reference while production uses only Postgres.
