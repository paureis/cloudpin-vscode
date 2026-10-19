# cloudpin for VS Code and Cursor: design

Issue: [paureis/cloudpin#18](https://github.com/paureis/cloudpin/issues/18). Ships with cloudpin 1.3.0 "Fix it, see it"
(Thursday 2026-12-03). Owner decisions of 2026-10-18 are marked **(owner)**; VS Code facts were checked against the
official docs and `vscode.d.ts` the same day (sources inline).

## What it does

A status bar item showing whether the cloud CLIs are on the accounts pinned in the workspace's `.cloudpin.yml`:

| cloudpin says | Item | Hover (plain Markdown, not trusted) |
|---|---|---|
| `match` | `$(pinned) cloudpin` (or `$(pinned) <environment>`), foreground `testing.iconPassed` (green) | each pinned cloud and "matches" |
| `mismatch` (any pinned cloud `mismatch`, `not-logged-in` or `unknown`) | `$(pinned-dirty) cloudpin`, background `statusBarItem.errorBackground` (red) | each cloud's problems and fix, from `check --json` |
| `error` (the pin file is invalid) | `$(warning) cloudpin`, background `statusBarItem.warningBackground` | the error text |
| `unpinned` in the folder in focus | `$(pin) cloudpin`, foreground `disabledForeground` (grey) | "no .cloudpin.yml in this folder" |
| cloudpin not found, older than 1.2.0, or failed to run | grey `$(circle-slash) cloudpin` | how to install or upgrade, and the reason |
| Restricted Mode | grey `$(shield) cloudpin` | "trust this folder to check its accounts" |

`statusBarItem.backgroundColor` only supports the error and warning colours, so green is a foreground colour
(`vscode.d.ts` `StatusBarItem.backgroundColor`; theme ids from code.visualstudio.com/api/references/theme-color). The
item has a `name` ("cloudpin") and `accessibilityInformation` that says the state in words.

**Click** (owner, issue #18): opens a terminal named "cloudpin switch" (`window.createTerminal({ name, cwd: folder,
isTransient: true })`) in the user's default shell and sends `cloudpin switch`, so the shell-init `cloudpin` function
can set `AWS_PROFILE` in that shell. With cloudpin older than 1.3.0 it sends `cloudpin check` instead. When that
terminal closes, the item refreshes. When cloudpin is missing, the click opens cloudpin's install instructions
(README) in the browser.

Commands: `cloudpin.refresh` ("cloudpin: Refresh"), `cloudpin.switch` ("cloudpin: Switch to the pinned accounts").

## Where the answer comes from (owner)

- It runs the **installed** cloudpin, the one the shell wrappers and agent hooks use, so they never disagree:
  `cloudpin check --json` (cloudpin 1.2.0+), with cwd = the workspace folder in focus. `check` only resolves the
  pinned CLIs and uses guard's own verdict (agent mode: `CLOUDPIN_SKIP` doesn't count), unlike `status`, which also
  resolves unpinned CLIs. `cloudpin --version` is read once per activation for the version gate.
- **Resolve cloudpin to an absolute path first** and spawn that path, never the bare name: on Windows, Node/libuv,
  cmd.exe and the `which` lookup inside cross-spawn search the current folder before PATH, so a `cloudpin.cmd`
  planted in a repository would run (the same bug class fixed in cloudpin 1.1.1, GHSA-3cf7-5v5w-q5vr). The resolver
  walks the extension host's PATH, skips empty and relative entries and **any entry inside an open workspace
  folder**, uses PATHEXT on Windows, and requires a regular file (executable outside Windows). Then spawn with
  `cross-spawn` (which escapes arguments for the npm `.cmd` shim; Node refuses `.cmd` without a shell since
  CVE-2024-27980), no shell, a 20 s timeout, stdout/stderr captured, never printed except the reason line.
- The JSON is parsed defensively: anything unexpected becomes the grey "failed to run" state with a short reason.
  The hover never shows raw output beyond cloudpin's own `problems`/`fix` strings, escaped as Markdown text.
- On macOS/Linux a dock-launched VS Code resolves the login-shell environment at startup (code.visualstudio.com/docs/
  supporting/FAQ), so PATH usually includes npm's global bin. If cloudpin is not found the hover says so and links
  the install docs; no `cloudpin.path` setting in 1.0 (it would need `restrictedConfigurations`).

## When it refreshes (owner)

On activation; when `.cloudpin.yml` in an open folder is created, changed or deleted (`workspace.createFileSystemWatcher`
per folder); when the window regains focus (`window.onDidChangeWindowState`, at most once every 30 s); when the
active editor moves to another workspace folder; when workspace folders change; after the switch terminal closes
(`window.onDidCloseTerminal`); and on `cloudpin.refresh`. No background timer. One check at a time: a refresh asked
for while one runs is run once after it (coalesced).

## Workspace rules

- Activation: `workspaceContains:**/.cloudpin.yml` (code.visualstudio.com/api/references/activation-events);
  contributed commands need no `onCommand` entries since VS Code 1.74. A pin file created after the window opened is
  picked up on the next window load (documented in the README).
- Multi-root: the folder of the active editor (`workspace.getWorkspaceFolder(uri)`), else the first folder with a
  `.cloudpin.yml`. cloudpin itself finds the nearest pin file upward from that folder.
- `capabilities.untrustedWorkspaces: { supported: "limited", description }`: in Restricted Mode nothing is spawned;
  the item says why and refreshes on `workspace.onDidGrantWorkspaceTrust`. `virtualWorkspaces: false`.
- `engines.vscode: "^1.100.0"`, so Cursor (VS Code 1.128 API base per Cursor staff, mid-2026) installs it;
  `@types/vscode` pinned to the same minor (vsce rejects a newer one).

## Package and code layout

- TypeScript, bundled with esbuild (`platform: node`, `format: cjs`, `external: ["vscode"]`) into `dist/extension.js`
  (code.visualstudio.com/api/working-with-extensions/bundling-extension). Runtime dependency: `cross-spawn` only
  (bundled). `.vscodeignore` ships `dist/`, README, CHANGELOG, LICENSE, the icon.
- Pure modules with no `vscode` import, unit-tested with vitest: the PATH resolver, the `check --json` parser and
  state mapping, the hover text builder (escaping), the version gate, the refresh scheduler (debounce/coalesce with an
  injected clock). A thin `extension.ts` wires them to the API.
- Icon: a 128x128 PNG pin (vsce refuses SVG icons). Publisher `paureis`, name `cloudpin`, `repository` the GitHub repo,
  MIT. `paureis.cloudpin` was free on both registries on 2026-10-18.

## CI and release (owner: workflow, you approve)

- PR check: one Linux job under 5 minutes: `npm ci`, typecheck, lint-free unit tests, `vsce package` (the .vsix as a
  workflow artifact), `cancel-in-progress`.
- An Electron smoke test (`@vscode/test-cli` under `xvfb-run`: the extension activates in a folder with a pin file and
  a fake `cloudpin` on PATH, and creates its item) runs by hand and on the release tag, not on PRs.
- Release: a `vX.Y.Z` tag builds the .vsix, attaches it to a GitHub Release with `SHA256SUMS`, and a `publish` job in
  the protected environment `marketplace` (required reviewer: the owner) publishes to both registries.
  - VS Code Marketplace: Azure DevOps global PATs retire on 2026-12-01, so no PAT. Use `vsce publish --oidc` (trusted
    publishing, vsce README) if the Marketplace offers the policy UI by then, otherwise `--azure-credential` with an
    Entra workload identity. Set up with the owner before the first release (publisher account first).
  - Open VSX: the first version needs an access token (environment secret); after it, trusted publishing
    (`ovsx publish --trusted-publishing`, bound to the workflow and environment) and the token is deleted.
  - Until those accounts exist the release job only builds and attaches the .vsix.
- Versioning: independent of cloudpin; 1.0.0 is the first published version.

## Out of scope for 1.0

- Showing which commands would be blocked, or running `cloudpin explain` (a later idea).
- A `cloudpin.path` setting; per-cloud items; notifications on mismatch.
- Running `cloudpin switch` without a terminal (it needs the user's shell for `AWS_PROFILE`).
