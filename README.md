# Japanese Companion

Japanese Companion is a local-first JLPT study app for vocabulary, kanji, quiz practice, spaced review, and personal study notes.

The app is designed to keep the learning experience responsive while persisting study progress to the repository's combined JSON curriculum assets.

## Features

- Multiple curriculum books with per-book progress.
- Study sessions followed by quiz sessions.
- Review scheduling with up to six stages (six is the default):
  - Stage 1: New
  - Stage 2: 1-day interval
  - Stage 3: 3-day interval
  - Stage 4: 7-day interval
  - Stage 5: 30-day interval
  - Stage 6: Graduated
- Failed Days move down one stage, never below Stage 1, and are scheduled after the configured retry delay (one day by default).
- Review sessions use the same all-items-must-pass rule as learning sessions.
- Personal decomposition notes, personal notes, and editable quiz problems.
- A persistent client-side source-write queue for intermittent connectivity.
- Local and network-friendly development access through Vite.

## Review settings

The Settings view provides two spaced-repetition options. Existing values remain the defaults:

- Maximum review stage: `6`. A Day graduates when it reaches this stage. The available range is Stage 2 through Stage 6.
- Retry after failure: `1` day. When a Day is not fully correct, it drops one stage and becomes due again after this delay. The available range is 1 through 30 days.

Successful review intervals remain the current `1`, `3`, `7`, and `30` day schedule. These settings are stored in the server-side app preferences and are shared by devices using the same app data. Changing the maximum stage does not rewrite existing Day history.

## Project structure

```text
client/                 React/Vite application
  src/components/       UI components
  src/domain/           Study, SRS, persistence, and controller logic
  src/data/              Initial state and browser storage
server/                 Node HTTP API and repository file writer
  src/                  API routes and server services
asset/                  Canonical combined curriculum JSON files
docs/                   Project documentation
scripts/                Development orchestration and verification scripts
server-data/            Local server preferences; do not commit private runtime data
```

## Requirements

- Node.js with npm workspaces support.

Install dependencies from the repository root:

```bash
npm install
```

## Running the app

### Development mode

Start the API server and Vite development server together:

```bash
npm run dev
```

The development server is local-only by default. The API defaults to port `3001`, and Vite defaults to its normal development port unless overridden by environment variables.

To run the workspaces separately:

```bash
npm run dev:server
npm run dev:client
```

### Local preview mode

The local preview launcher runs the API server and Vite preview server on the project's local production-style ports:

```bash
npm run local:no-build
```

The default local preview ports are:

- Preview: `47832`
- API: `47833`

`npm run local` performs a client build before starting the preview. Do not run a build unless the user explicitly requests it.

Public-mode commands are available when external access is configured:

```bash
npm run prod:no-build
npm run prod
```

Do not expose a public server without an intentional access-control and network configuration.

## Curriculum assets

The canonical curriculum format is the combined JSON structure in `asset/*.json`.

Typical files include:

```text
asset/
  jlpt-one-book-n1.json
  jlpt-short-term.json
  dev.json
```

Only files with `"format": "combined"` are treated as curriculum books. Each file contains unit groups under `days[]`, Day blocks under each unit's `day[]`, and item records under each Day's `items[]`.

Important Day fields:

- `stage`
- `stageCompleteDate`
- `nextReviewDate`
- `lastAttemptDate`
- `lastCompletedDate`
- `items`

Important item fields include `id`, `expression`, reading data, `meaningKo`, `problem`, `lastResult`, `memoDecomposition`, and `memoPersonal`.

See [docs/CURRENT_ASSET_STRUCTURE.md](docs/CURRENT_ASSET_STRUCTURE.md) for the asset schema reference.

The combined JSON files are the current source of truth. Do not migrate the project back to the deprecated `src.json`, `manifest.json`, or `study.json` structure unless the project specification explicitly changes.

## Study and persistence model

The browser builds the selected curriculum from the asset files and stores a local per-book state in browser storage. The server reads and updates the combined JSON files through the API.

When a quiz answer is selected, the UI updates optimistically without sending an item-level result immediately. On Day completion, the client creates one batch result containing all item `lastResult` values plus the Day stage and review schedule, then queues it for `/api/save-day-result`. The persistent queue retries transient failures and exposes pending, retrying, and failed entries in Settings.

Other edits, such as personal notes and quiz problems, still use `/api/save-item-field`. Starting a Day may also record the attempt date separately so an abandoned session is not mistaken for an unattempted Day. If the app is offline, the completed Day batch remains queued and is retried later.

`save-day-result` validates every item target before changing the file and writes the item results and Day schedule together. This keeps a failed or interrupted batch from leaving a partially updated Day in the canonical asset file.

## Git synchronization

The Settings sync action fetches the upstream branch, stages changes under `asset/`, creates the progress commit, and pushes the result. Because the sync scope is the whole `asset` directory, review the staged file list before syncing when multiple curriculum files may have local changes.

The application progress-sync commit message is:

```text
update JLPT study progress
```

For manual code changes, use a concise type-prefixed message, for example:

```text
[fix] hide queued learning days from home
```

Never commit access tokens, private gateway URLs, or local runtime data.

## Verification

Run focused checks from the repository root:

```bash
node scripts/test-source-write-queue.cjs
npm run test:save-day-result
npm run test:stage-progression
npm run typecheck
```

If a check fails, identify whether the failure is caused by the current change or by an existing baseline issue before changing unrelated code.

## Working rules

1. Follow the user's explicit request first, then the project documentation, then normal engineering judgment.
2. Before editing, identify the exact files that are in scope.
3. Prefer read-only inspection or dry-run verification before making changes.
4. Preserve unrelated working-tree changes. Do not use broad staging or destructive Git commands to clean them up.
5. Treat `asset/*.json` combined files as canonical data and preserve their existing structure and encoding.
6. Do not run builds without an explicit user request.
7. Do not commit secrets, access tokens, generated private runtime files, or unrelated asset changes.
8. When changing study persistence, verify both the browser state and the source asset state, including offline or retrying-queue behavior.
9. Keep documentation and tests aligned with behavior changes.

## License

No license has been declared for this private project.