# cloudpin for VS Code and Cursor

A status bar item that tells you whether your cloud CLIs are on the accounts pinned in the workspace's
[`.cloudpin.yml`](https://github.com/paureis/cloudpin#configuration). It asks the
[cloudpin](https://github.com/paureis/cloudpin) you already have installed, the same one your shell wrappers and agent
hooks use, so the editor and the terminal never disagree. Click it to switch to the pinned accounts.

> **Not released yet.** 1.0.0 ships together with cloudpin 1.3.0.

## Requirements

- **cloudpin 1.2.0 or later**, installed and on the PATH that VS Code sees
  ([install instructions](https://github.com/paureis/cloudpin#install)). The click runs `cloudpin switch`, which needs
  cloudpin 1.3.0; with 1.2.x it runs `cloudpin check` instead.
- VS Code 1.100 or later, or Cursor.
- A local folder (not a remote or virtual one) with a `.cloudpin.yml` in it.

On macOS and Linux, VS Code started from the Dock reads your login shell's environment when it starts, so npm's
global folder is usually on its PATH. If the item says cloudpin isn't found, start VS Code from a terminal where
`cloudpin --version` works.

## What it shows

| cloudpin says | Item | Hover |
|---|---|---|
| every pinned cloud matches | green `$(pinned) cloudpin`, or the environment's name | each pinned cloud and "matches" |
| a pinned cloud is on another account, not logged in, or can't be read | red `$(pinned-dirty) cloudpin` | each cloud's problem and the fix, from cloudpin |
| the pin file is invalid | yellow `$(warning) cloudpin` | the error |
| no `.cloudpin.yml` in the folder | grey `$(pin) cloudpin` | "no .cloudpin.yml in this folder" |
| cloudpin not found, older than 1.2.0, or it failed to run | grey `$(circle-slash) cloudpin` | how to install or upgrade, and why |
| Restricted Mode | grey `$(shield) cloudpin` | "trust this folder to check its accounts" |

The item runs `cloudpin check --json` in the workspace folder you're working in: the folder of the active editor, or
else the first folder with a `.cloudpin.yml`. It checks again when the pin file changes, when you come back to the
window (at most every 30 seconds), when you move to a file in another folder, when folders are added or removed, after
the switch terminal closes, and on **cloudpin: Refresh**. There is no background timer.

## Switching accounts

Clicking the item (or **cloudpin: Switch to the pinned accounts**) opens a terminal named "cloudpin switch" in your
default shell and runs `cloudpin switch` there. When that terminal closes, the item checks again. If cloudpin is
missing, the click opens its install instructions instead; in Restricted Mode it opens the workspace trust settings.

**AWS profiles are per shell.** For AWS, `cloudpin switch` sets `AWS_PROFILE` through cloudpin's `shell-init`
function, so it applies only in that terminal. VS Code itself, and so this item, keeps the environment it started
with: if your AWS pin depends on `AWS_PROFILE`, the item can still show a mismatch after the switch. Set the profile
where VS Code starts, or pin the profile that is active by default.

## Good to know

- **Restricted Mode**: in a folder you haven't trusted, the extension runs nothing. The item asks you to trust the
  folder and checks as soon as you do.
- **A pin file added after the window opened** is picked up on the next window load (**Developer: Reload Window**),
  because VS Code starts the extension only in folders that already have a `.cloudpin.yml`. Changes to an existing pin
  file are picked up straight away.
- **After upgrading cloudpin**, reload the window: the extension reads `cloudpin --version` once per window.
- **Which cloudpin runs**: the extension looks cloudpin up on PATH itself and runs that file directly, without a
  shell. It skips relative PATH entries and any PATH entry inside an open workspace folder, so a `cloudpin` committed
  to a repository is never what it runs.
- **What it shows you**: only cloudpin's own result. The hover repeats cloudpin's problem and fix texts as plain
  text, and cloudpin never puts a token or key in them. The extension sends nothing anywhere.

## Development

```sh
npm ci
npm run typecheck
npm test              # unit tests (vitest)
npm run build         # dist/extension.js (esbuild)
npm run test:smoke    # a real VS Code with a fake cloudpin; on Linux: xvfb-run -a npm run test:smoke
npx vsce package      # the .vsix
```

`docs/design.md` has every decision and why. Security reports: see [SECURITY.md](SECURITY.md).

## About

Made by [Alvaro Reis](https://github.com/paureis), with Claude Code as a pair programmer. Every behaviour is covered by
tests, the VS Code APIs it uses were checked against the official documentation and `vscode.d.ts`, and a smoke test
runs it in a real VS Code. It is a companion to
[cloudpin](https://github.com/paureis/cloudpin), which does the actual checking.

[MIT](LICENSE)
