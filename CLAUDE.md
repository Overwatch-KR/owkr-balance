# CLAUDE.md - OWKR Match

`AGENTS.md` is the canonical repository instruction document. Read and follow it before changing code. This file only records the minimum current context needed to avoid using the repository's former GitHub Pages architecture.

## Current architecture

- React 19, TypeScript 5.9, Rolldown Vite and Tailwind CSS 3.4
- Vercel deployment: Vite static frontend plus Node.js Vercel Functions
- Discord OAuth for administrator access and Redis for shared server state
- `src/components` presentation → `src/application` workflows → `domains/*` public APIs
- Team balancing runs through the browser Web Worker in `src/workers`
- Full admin pages: `/`, `/participants`, `/user-sheet`, `/scrims`, `/event-participants`
- Public participation: `/participate/:token`; Discord policy: `/discord-login-policy`

Do not restore the old `src/utils/balance` domain, GitHub Pages deployment assumptions, modal user sheet, microphone balancing option, or BattleTag-only identity model.

## Commands

```bash
pnpm dev              # Local auth, local-only data, Vercel Functions
pnpm dev:frontend     # Vite frontend only
pnpm dev:local        # Local auth with configured Redis; may write real data
pnpm dev:full         # Discord OAuth with .env.local
pnpm check            # Typecheck, lint, tests, boundaries, production build
```

## Current product rules

- A roster has 10 participants; additional players enter the waitlist.
- Roles are `TANK`, `DPS`, and `SUPPORT`; use `!` for preferred and `?` for one avoided role.
- At least two roles need a ranked tier; the remaining role may be `UNRANKED`.
- User identity prefers the user-sheet row UUID and Discord user ID, with a unique BattleTag only as fallback.
- Live collaboration and read-only result sharing use 10-character codes that expire after 24 hours.
- Live collaboration uses revision checks and adaptive polling: 500 ms while active, 1.5 s while idle, immediate refresh when the tab becomes active.
- Shared user notes are visible to all admins; personal operation notes are scoped to the signed-in admin.

For file placement, styling, imports, changelog policy and commit conventions, follow `AGENTS.md` and `docs/project-structure.md`.
