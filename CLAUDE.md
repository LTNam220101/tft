# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Convex backend + Vite dev server concurrently (http://localhost:3000)
npm run dev:web      # Vite dev server only
npm run dev:convex   # Convex backend watch mode only
npm run dev:ts       # TypeScript type-checker in watch mode
npm run lint         # tsc + ESLint (strict — zero warnings allowed)
npm run build        # Vite build + tsc --noEmit
npm run format       # Prettier auto-format
npm start            # Run production server from .output/server/index.mjs
```

## Architecture

**Frontend:** React 19 + TanStack Router (file-based, auto-generated route tree at `src/routeTree.gen.ts`) + TanStack React Query v5. Styles use Tailwind CSS 4. Path alias `~/` maps to `./src/`.

**Backend:** [Convex](https://convex.dev) — serverless database + functions. All backend logic lives in `convex/`. `ACTIVE_SET_KEY` in `convex/gameConfig.ts` controls which TFT set the UI uses (currently `"TFTSet17"`).

**Server runtime:** Nitro SSR (output to `.output/`), deployed via Docker on a VPS.

**Game data source:** Community Dragon API, fetched and seeded via `convex/mutations/seed.ts`. CDN base URL configured by `VITE_CDRAGON_PATCH` env var.

## Convex Patterns

### Function visibility
- `query` / `mutation` / `action` — public API, callable from the client.
- `internalQuery` / `internalMutation` / `internalAction` — private, only callable by other Convex functions. Use these for any function that should not be exposed externally.

### Argument validators
Always include `args` validators for every Convex function using `v` from `convex/values`. All fields in the schema use `v.optional(...)` to allow partial updates.

### Actions vs. queries/mutations
Actions (`action`, `internalAction`) cannot access the database directly via `ctx.db`. They must call queries/mutations via `ctx.runQuery` / `ctx.runMutation`. The optimizer in `convex/optimizer.ts` is an action because it's compute-heavy; it calls internal queries to fetch champions/traits and returns results without writing to the DB.

### Cross-file `ctx.run*` calls
When calling `ctx.runQuery` / `ctx.runMutation` on a function in the same file, add an explicit return-type annotation to avoid TypeScript circularity errors.

### Minimize round-trips
Queries and mutations are transactions. Avoid splitting logic into multiple `ctx.runQuery` / `ctx.runMutation` calls where possible to prevent race conditions.

## Database Schema

Three tables, all indexed by `['setKey', 'key']`:

| Table | Key shape | Notable fields |
|-------|-----------|---------------|
| `champions` | `tft17_ahri` | `cost`, `traits[]`, `iconPath`, `isLocked` |
| `traits` | `TFTSet17_Arcana` | `effects[]`, `innateConstants`, `unique`, `isRegion` |
| `items` | `TFT17_Item_Emblem_*` | `nameId` maps emblem → trait name |

All fields are `v.optional(...)` to support multi-set data in the same tables. Do not change this to required without a migration plan.

## Key Files

- `convex/optimizer.ts` — Core team-suggestion action (`suggestTeams`). Backtracking solver scored by trait thresholds. Supports `wide` (breadth) and `deep` (depth) modes.
- `convex/optimizerMissFortune.ts` — Set 17 special case: Miss Fortune's traits are optional based on selected emblems.
- `convex/mutations/seed.ts` — Seeds all game data from Community Dragon. Run manually to refresh data for a new patch.
- `src/routes/index.tsx` — The entire UI (~660 lines). Single-page optimizer: emblem picker, team size, champion forced/blocked lists, results grid with hover interactions.
- `src/traitTooltip.ts` — Decodes trait description templates from game data (replaces `@variable@` placeholders).

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_CONVEX_URL` | Convex deployment URL (e.g. `https://keen-cardinal-324.convex.cloud`) |
| `VITE_CDRAGON_PATCH` | Community Dragon base URL for game assets |

## Deployment

Push to `master` triggers `.github/workflows/deploy-master.yml`:
1. Deploy Convex functions to production (`npx convex deploy`)
2. Build Docker image with `VITE_CONVEX_URL` + `VITE_CDRAGON_PATCH` baked in
3. Push to Docker Hub and SSH-deploy to VPS

To switch to a new TFT set: update `ACTIVE_SET_KEY` in `convex/gameConfig.ts`, run seed, and redeploy.
