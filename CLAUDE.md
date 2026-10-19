# cloudpin-vscode — project rules

The VS Code / Cursor extension for [cloudpin](https://github.com/paureis/cloudpin): a status bar item fed by
`cloudpin check --json`. Read `docs/design.md` first (the owner-approved design), then `HANDOFF.md` if it exists
(local session notes, gitignored).

**Shared rules live in the cloudpin repo's `CLAUDE.md`** (commits, one branch per issue, secrets, personal details,
dependencies, CI budget, owner approvals). They all apply here. The points below are only what differs or matters most.

## Commands

| Task | Command |
|---|---|
| Install from lockfile | `npm ci` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm test` (vitest) |
| Build `dist/extension.js` | `npm run build` (esbuild) |
| Electron smoke test | `npm run test:smoke` (Linux without a display: `xvfb-run -a npm run test:smoke`; `CLOUDPIN_SMOKE_CODE=<path to Code>` reuses an installed VS Code) |
| Package the .vsix | `npx vsce package` (check it with `npx vsce ls`) |
| Redraw the icon | `node scripts/icon.mjs` |

Run each as its own call and read its exit code.

## Rules

- `src/*.ts` other than `extension.ts` never import `vscode`; they are unit-tested directly. `extension.ts` is glue,
  tested against `test/fake-vscode.ts`.
- Spawn only the absolute path `findCloudpin` returns, through `runFile` (cross-spawn, no shell, 20 s timeout). Never
  `shell: true`, never `child_process.exec`. Nothing is spawned in Restricted Mode.
- Every piece of outside text in a hover goes through `escapeMarkdown`; the hover stays an untrusted MarkdownString
  without HTML or theme icons. Never show cloudpin's raw output beyond its `problems`/`fix` strings and one stderr line.
- Tests never spawn a real cloud CLI or the real cloudpin; they write fake `cloudpin` scripts into temporary folders
  and remove them.
- Runtime dependency: `cross-spawn` only, bundled. `@types/vscode` stays on the `engines.vscode` minor (vsce rejects a
  newer one). Install with `socket npm install`; after any dependency change, delete `node_modules` and
  `package-lock.json`, reinstall, and check `grep -c '"node_modules/@esbuild/' package-lock.json` is about 25.
- Never publish to the Marketplace or Open VSX, or change repository settings, without the owner's explicit yes.
