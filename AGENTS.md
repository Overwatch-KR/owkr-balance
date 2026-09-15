# AGENTS.md - OWKR Match

## Project Overview

OWKR Match is a web-based Overwatch 2 team balancing tool for managing competitive scrimmages. It parses player data, runs an optimization algorithm to balance teams by rank, and supports manual adjustments. The UI is in Korean.

## Tech Stack

- **Frontend:** React 19, TypeScript 5.9, Vite (Rolldown), Tailwind CSS 3.4
- **Hosting:** Vercel (Vite static frontend + Vercel Functions)
- **Animation:** Framer Motion
- **Build:** Vite, ESLint 9, PostCSS

## Project Structure

```
src/
├── App.tsx              # Composition root while app routing is incrementally extracted
├── application/         # Cross-component use cases and orchestration
│   └── roster/          # Roster editing/import workflows
├── components/          # Presentation by feature
│   ├── event/           # Event participation registration and management
│   ├── layout/          # Shared page/header structure
│   ├── player/form/     # Player input + bulk paste
│   ├── player/list/     # Player list display
│   ├── match/result/    # Team cards + swap UI
│   ├── scrim/           # Scrim operations, surveys, and reviews
│   ├── user-sheet/      # Dedicated shared user sheet page and editors
│   └── roles/icon/      # Role icons
├── hooks/               # View/browser hooks and compatibility re-exports
├── types/               # Compatibility exports for domain types
├── constants/           # Tier definitions, scoring
└── utils/
    ├── parser/          # Discord chat log parsing
    └── storage/         # Browser session and UI preference storage

api/                     # Vercel Functions and server stores
domains/balance/         # Core balancing algorithm and result model
domains/player/          # Player, rank, role, and tier model
domains/scrim/           # Shared scrim contracts and public boundaries
.github/workflows/       # CI and deployment workflows
```

The frontend uses a pragmatic layered architecture: `components` (presentation) may call `application` (use cases), and both consume domain public APIs. Do not duplicate the existing domain core into generic controller/service/repository folders.

## Commands

```bash
pnpm dev              # Start safe local-only app with local auth and no remote Redis
pnpm dev:frontend     # Start the Vite frontend without Functions
pnpm dev:local        # Start local auth against configured Redis (writes real data)
pnpm dev:full         # Start Discord OAuth and Functions from .env.local
pnpm build    # Production build to dist/
pnpm lint     # ESLint check
pnpm preview  # Preview production build
pnpm check    # Typecheck, lint, test, boundaries, and build
```

## Key Concepts

### Scoring Formula
```typescript
base = [0, 500, 1100, 1800, 2600, 3600, 4800, 6200, 7800][tierIndex]
nextBase = next tier base, or base + 500 for Champion
score = base + round(((nextBase - base) / 5) * (5 - division))
// Divisions: 1-5; tiers: BRONZE → SILVER → GOLD → PLATINUM → EMERALD → DIAMOND → MASTER → GRANDMASTER → CHAMPION
```

### Role System
- Roles: `TANK`, `DPS`, `SUPPORT`
- Use `!` suffix for preferred role (e.g., `다이아3!`)
- Use `?` suffix for one avoided role and `미배치`/`UNRANKED` for at most one unranked role
- Algorithm prioritizes preferred-role violations (unless ignored), tank safety, avoided roles, unranked roles, then score balance
- Shared roster identity uses user-sheet UUID and Discord user ID before a unique BattleTag fallback

### Player Input Formats
```
PlayerName#1234 탱커 다이아3 딜러 플레4 힐러 마스터5
PlayerName#1234 다3 플2 골1          # Abbreviations
PlayerName#1234 다3! 플2 골1         # ! = preferred
```

## Patterns & Conventions

- **Components:** Functional + hooks only, no class components
- **Application:** Put workflows that coordinate multiple states/effects under `src/application/<feature>/`; application code must not import presentation components
- **State:** TanStack Query for remote server state; useState/useEffect and focused hooks for local UI state; expiring browser storage for session UI state, Redis for shared state, no Redux
- **Naming:** PascalCase components, camelCase functions, UPPER_SNAKE constants
- **Styling:** Dense dark `OWKR Match Control` console; prefer dividers and surface depth over nested cards. Cyan is for primary/active/live state, blue/red for teams, emerald for success, amber for warnings
- **Page navigation:** Full admin pages use `src/components/layout/page-header.tsx` without redundant breadcrumbs; reserve standalone back buttons for modal/step/detail flows
- **Imports:** Frontend domain consumers use `#domain/balance`, `#domain/player`, `#domain/scrim`, or `#domain/scrim/rules`; Vercel Functions use the domain public API through explicit relative `.js` paths because deployment cannot safely bundle the TypeScript import aliases
- **Layer aliases:** Use `@application/*` and `@presentation/*` when a cross-layer frontend import is clearer than a long relative path; keep short same-feature relative imports
- **TypeScript:** Strict mode, explicit types, interfaces for data models
- **JSDoc:** Flow-focused, concise, and every JSDoc block must include an `@description` tag; avoid exhaustive narration
- **CSS:** Keep style files free of comments

## Changelog

- Update the root `CHANGELOG.md` for every user-facing feature, fix, behavior change, operational change, and policy change.
- Record completed but not yet deployed work under `미배포` using the current `Asia/Seoul` date.
- After a production deployment, move the corresponding entries into that date's deployment section and include the deployed commit.
- Preserve existing deployment history; do not rewrite or remove past entries unless correcting inaccurate information.

## Commit Messages

- Write every commit message in English.
- Follow Conventional Commits using the format `<type>(<optional scope>): <description>`.
- Keep the description concise, imperative, and lowercase.
- Use established types such as `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, and `chore`.
- Example: `feat(auth): restore random login background rotation`.

## Important Files

- `domains/balance/shared/balance.ts` - Core balancing algorithm (most complex logic)
- `domains/player/shared/model.ts` - Player, rank, role, and tier model
- `src/application/roster/use-roster-management.ts` - Roster orchestration entry point
- `src/hooks/use-balance.ts` - Balance Web Worker lifecycle
- `src/utils/parser/index.ts` - Player input parsing
- `src/App.tsx` - Current application composition root
- `src/constants/index.ts` - Tier definitions, scoring formula
- `docs/project-structure.md` - Directory responsibilities and dependency direction

## Notes

- Tests use Vitest
- Korean UI throughout
- Deployed on Vercel with Vite static assets and Vercel Functions
- Browser match state is scoped by admin ID and expires after 30 minutes; remembered live/share codes expire after 24 hours
- Live collaboration uses revision-based adaptive polling: 500 ms while active, 1.5 s while idle, and immediate refresh on focus/visibility return
