# AGENTS.md - OWKR Match

## Project Overview

OWKR Match is a web-based Overwatch 2 team balancing tool for managing competitive scrimmages. It parses player data, runs an optimization algorithm to balance teams by rank, and supports manual adjustments. The UI is in Korean.

## Tech Stack

- **Frontend:** React 19, TypeScript 5.9, Vite (Rolldown), Tailwind CSS 3.4
- **Hosting:** GitHub Pages (static site)
- **Animation:** Framer Motion
- **Build:** Vite, ESLint 9, PostCSS

## Project Structure

```
src/
├── components/          # React components by feature
│   ├── player/form/    # Player input + bulk paste
│   ├── player/list/    # Player list display
│   ├── match/result/   # Team cards + swap UI
│   └── roles/icon/     # Role icons
├── hooks/
│   └── use-balance.ts  # Balance worker state
├── types/              # TypeScript interfaces
├── constants/          # Tier definitions, scoring
└── utils/
    ├── balance/        # Core balancing algorithm
    └── parser/         # Discord chat log parsing

.github/workflows/       # GitHub Pages deployment
```

## Commands

```bash
pnpm dev      # Start dev server (localhost:5173)
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

- `src/utils/balance/index.ts` - Core balancing algorithm (most complex logic)
- `src/hooks/use-balance.ts` - Balance Web Worker lifecycle
- `src/utils/parser/index.ts` - Player input parsing
- `src/App.tsx` - Main component orchestrating state
- `src/constants/index.ts` - Tier definitions, scoring formula

## Notes

- Tests use Vitest
- Korean UI throughout
- Deployed on GitHub Pages through GitHub Actions
- localStorage keys: `owkr_players`, `owkr_result`
