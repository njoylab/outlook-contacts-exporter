# Repository Guidelines

## Project Structure & Module Organization
- `extract-contacts.ts` is the main TypeScript CLI that parses extracted `.olm` archives and writes CSV/vCard outputs.
- `src/` at the repo root contains the UI styles and app entry used for the desktop/web interface prototype.
- `web/` is a standalone Vite + React app with its own `src/`, `public/`, and build configs.
- `output/` and `test-output/` hold generated CSV/VCF artifacts; treat them as disposable.
- Large inputs like `.olm` archives should stay outside version control; the sample file in the root is local only.

## Build, Test, and Development Commands
Root (CLI):
- `npm install`: install dependencies for the CLI tool.
- `npm run extract <olm-extracted-dir> [output-dir]`: run the contact extractor over an unzipped OLM directory.
- `npx tsx extract-contacts.ts <olm-extracted-dir> [output-dir]`: direct execution without a script.

Web app (Vite):
- `cd web && npm install`: install web dependencies.
- `cd web && npm run dev`: start the local dev server.
- `cd web && npm run build`: type-check and build the production bundle.
- `cd web && npm run lint`: run ESLint.

## Quick Start
1. `npm install`
2. `unzip backup.olm -d olm_extracted`
3. `npm run extract ./olm_extracted ./output`
4. Open `output/contacts.csv` or `output/contacts.vcf` to verify results.

## Quick Start (Web UI)
1. `cd web && npm install`
2. `cd web && npm run dev`
3. Open `http://localhost:5173/` and upload a `.olm` file.

## Coding Style & Naming Conventions
- TypeScript, ES modules (`"type": "module"`). Prefer `async/await` and explicit types for exported helpers.
- Indentation: 2 spaces; keep lines short and functions focused.
- Naming: `camelCase` for variables/functions, `PascalCase` for React components, `kebab-case` for file names.
- Formatting/linting: ESLint is configured in `web/`; no formatter is configured at the root.

## Testing Guidelines
- No automated tests are set up in the root or `web/` packages.
- If you add tests, document how to run them and keep test data small (avoid committing `.olm` files).

## Commit & Pull Request Guidelines
- This workspace does not include Git history, so no local commit convention is discoverable.
- Use clear, imperative commit subjects (e.g., "Add CSV escaping for commas") and include context in PR descriptions.
- PRs should mention the sample data used and include screenshots for `web/` UI changes.

## Security & Configuration Tips
- OLM files may include sensitive data. Prefer local processing and avoid uploading files to third-party services.
- The extractor expects an unzipped OLM directory (e.g., `unzip backup.olm -d olm_extracted`).
