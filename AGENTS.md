# Repository Guidelines

## Project Structure & Module Organization
- Root CLI tool lives in `extract-contacts.ts` with shared logic under `src/`.
- Tests are in `tests/` (Vitest), using `*.test.ts` naming.
- Static assets for the README and docs are in `assets/`.
- The web app is a separate Vite project under `web/` with its own `package.json`.

## Build, Test, and Development Commands
- `npm install`: install root dependencies for the CLI and tests.
- `npm run extract ./olm_extracted ./output`: run the CLI extractor against an unzipped `.olm` folder.
- `npm test`: run Vitest in the root project.
- `cd web && npm install`: install web app dependencies.
- `cd web && npm run dev`: start the Vite dev server at `http://localhost:5173/`.
- `cd web && npm run build`: type-check and build the web app for production.
- `cd web && npm run lint`: run ESLint on the web app.

## Coding Style & Naming Conventions
- TypeScript throughout; use semicolons and 2-space indentation (match existing files).
- Variables and functions use `camelCase`; React components use `PascalCase`.
- Prefer descriptive names for parsing helpers (e.g., `parseMessage`, `extractContacts`).
- Keep UI styling in Tailwind utility classes within `web/src` components.

## Testing Guidelines
- Framework: Vitest (`vitest.config.ts`).
- Test files live in `tests/` and should end with `.test.ts`.
- Add tests for parsing logic and edge cases (corrupt or missing XML).

## Commit & Pull Request Guidelines
- Commit messages are short, imperative, and sentence case (e.g., "Add CLI flag").
- PRs should include a concise summary, the motivation, and any user-facing impact.
- For UI changes, include before/after screenshots or a short screen recording.

## Security & Data Handling
- `.olm` files contain sensitive data; avoid logging raw content.
- The web UI processes files locally; do not add any upload or telemetry features.
