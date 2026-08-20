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
├── components/          # React components by feature
│   ├── event/           # Event participation registration and management
│   ├── player/form/     # Player input + bulk paste
│   ├── player/list/     # Player list display
│   ├── match/result/    # Team cards + swap UI
│   ├── scrim/          # Scrim operations, surveys, and reviews
│   └── roles/icon/      # Role icons
├── hooks/
│   └── use-balance.ts  # Balance worker state
├── types/              # Compatibility exports for domain types
├── constants/          # Tier definitions, scoring
└── utils/
    ├── parser/         # Discord chat log parsing
    └── storage/        # Browser session and UI preference storage

api/                     # Vercel Functions and server stores
domains/balance/         # Core balancing algorithm and result model
domains/player/          # Player, rank, role, and tier model
domains/scrim/           # Shared scrim contracts and public boundaries
.github/workflows/       # CI and deployment workflows
```

## Commands

```bash
pnpm dev      # Start Vite frontend development server
pnpm build    # Production build to dist/
pnpm lint     # ESLint check
pnpm preview  # Preview production build
pnpm check    # Typecheck, lint, test, and build
```

## Key Concepts

### Scoring Formula
```typescript
score = (tierIndex * 600) + ((6 - division) * 100)
// Tiers: BRONZE(0) → CHAMPION(7), Divisions: 1-5
```

### Role System
- Roles: `TANK`, `DPS`, `SUPPORT`
- Use `!` suffix for preferred role (e.g., `다이아3!`)
- Algorithm prioritizes preferred-role violations, avoided roles, unranked roles, then score balance

### Player Input Formats
```
PlayerName#1234 탱커 다이아3 딜러 플레4 힐러 마스터5
PlayerName#1234 다3 플2 골1          # Abbreviations
PlayerName#1234 다3! 플2 골1         # ! = preferred
```

## Patterns & Conventions

- **Components:** Functional + hooks only, no class components
- **State:** useState/useEffect, localStorage persistence, no Redux
- **Naming:** PascalCase components, camelCase functions, UPPER_SNAKE constants
- **Styling:** Tailwind dark theme (`#0b0c10` bg), blue/cyan gradients for CTAs
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
- `src/hooks/use-balance.ts` - Balance Web Worker lifecycle
- `src/utils/parser/index.ts` - Player input parsing
- `src/App.tsx` - Main component orchestrating state
- `src/constants/index.ts` - Tier definitions, scoring formula
- `docs/project-structure.md` - Directory responsibilities and dependency direction

## Notes

- Tests use Vitest
- Korean UI throughout
- Deployed on Vercel with Vite static assets and Vercel Functions
- localStorage keys: `owkr_players`, `owkr_result`
