// Thin glue between VS Code and the pure modules beside it. Everything that
// decides something lives in those modules and is unit-tested there.
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { Checker, TIMEOUT_MS } from "./checker";
import { pickFolder } from "./folder";
import { findCloudpin, isExecutableFile } from "./resolve";
import { runFile } from "./run";
import { RefreshScheduler } from "./scheduler";
import { failedView, INSTALL_URL, type Kind, type View } from "./state";

const PIN_FILE = ".cloudpin.yml";
const TERMINAL_NAME = "cloudpin switch";

/** What `activate` returns: read-only, for the smoke test. */
export interface Api {
  /** The state the item shows, or undefined before the first check. */
  state(): Kind | undefined;
}

/** What activateWith needs from the machine; tests pass fakes. */
export interface Host {
  checker: Checker;
  hasPinFile(folder: string): boolean;
  now(): number;
}

/** Local folders only: the extension declares `virtualWorkspaces: false`. */
const fileFolders = (): vscode.WorkspaceFolder[] =>
  (vscode.workspace.workspaceFolders ?? []).filter((folder) => folder.uri.scheme === "file");

export function activate(context: vscode.ExtensionContext): Api {
  return activateWith(context, {
    checker: new Checker({
      findCloudpin: () =>
        findCloudpin({
          env: process.env,
          platform: process.platform,
          workspaceFolders: fileFolders().map((folder) => folder.uri.fsPath),
          isFile: isExecutableFile,
        }),
      run: (file, args, cwd) => runFile(file, args, { cwd, env: process.env, timeoutMs: TIMEOUT_MS }),
    }),
    hasPinFile: (folder) => existsSync(join(folder, PIN_FILE)),
    now: Date.now,
  });
}

export function deactivate(): void {}

export function activateWith(context: vscode.ExtensionContext, host: Host): Api {
  const item = vscode.window.createStatusBarItem("cloudpin.status", vscode.StatusBarAlignment.Left, 100);
  item.name = "cloudpin";
  item.command = "cloudpin.switch";
  context.subscriptions.push(item);

  let shown: View | undefined;
  /** The folder of the last active editor that was inside a local workspace folder. */
  let editorFolder: string | undefined;
  /** The folder the latest check ran in. */
  let checkedFolder: string | undefined;
  const switchTerminals = new Set<vscode.Terminal>();

  const focusFolder = (): vscode.WorkspaceFolder | undefined => {
    const folders = fileFolders();
    const path = pickFolder(
      editorFolder,
      folders.map((folder) => folder.uri.fsPath),
      host.hasPinFile,
    );
    return folders.find((folder) => folder.uri.fsPath === path);
  };

  const render = (view: View) => {
    shown = view;
    item.text = view.text;
    item.color = view.color !== undefined ? new vscode.ThemeColor(view.color) : undefined;
    item.backgroundColor = view.background !== undefined ? new vscode.ThemeColor(view.background) : undefined;
    // Untrusted Markdown, no HTML, no theme icons: command links can't run from the hover.
    const hover = new vscode.MarkdownString(view.hover);
    hover.isTrusted = false;
    hover.supportHtml = false;
    hover.supportThemeIcons = false;
    item.tooltip = hover;
    item.accessibilityInformation = { label: view.label, role: "button" };
    item.show();
  };

  const scheduler = new RefreshScheduler(async () => {
    const folder = focusFolder();
    if (folder === undefined) {
      shown = undefined;
      checkedFolder = undefined;
      item.hide();
      return;
    }
    checkedFolder = folder.uri.fsPath;
    try {
      render(await host.checker.check({ trusted: vscode.workspace.isTrusted, folder: folder.uri.fsPath }));
    } catch (err) {
      render(failedView(err instanceof Error ? err.message : String(err)));
    }
  }, host.now);
  context.subscriptions.push({ dispose: () => scheduler.dispose() });
  const refresh = () => void scheduler.request();

  let watchers: vscode.FileSystemWatcher[] = [];
  const watch = () => {
    for (const watcher of watchers) watcher.dispose();
    watchers = fileFolders().map((folder) => {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, PIN_FILE));
      watcher.onDidCreate(refresh);
      watcher.onDidChange(refresh);
      watcher.onDidDelete(refresh);
      return watcher;
    });
  };
  context.subscriptions.push({ dispose: () => watchers.forEach((watcher) => watcher.dispose()) });

  const noteEditor = (editor: vscode.TextEditor | undefined): boolean => {
    if (editor === undefined) return false;
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (folder === undefined || folder.uri.scheme !== "file") return false;
    editorFolder = folder.uri.fsPath;
    return true;
  };
  noteEditor(vscode.window.activeTextEditor);

  const openSwitchTerminal = async () => {
    const folder = focusFolder();
    if (folder === undefined) return;
    const action = await host.checker.switchAction({ trusted: vscode.workspace.isTrusted, folder: folder.uri.fsPath });
    switch (action.kind) {
      case "trust":
        await vscode.commands.executeCommand("workbench.trust.manage");
        return;
      case "install":
        await vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
        return;
      case "terminal": {
        // The user's own shell, so the shell-init `cloudpin` function can set AWS_PROFILE there.
        const terminal = vscode.window.createTerminal({ name: TERMINAL_NAME, cwd: folder.uri, isTransient: true });
        switchTerminals.add(terminal);
        terminal.show();
        terminal.sendText(action.command);
      }
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("cloudpin.refresh", () => scheduler.request()),
    vscode.commands.registerCommand("cloudpin.switch", openSwitchTerminal),
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) void scheduler.requestOnFocus();
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (noteEditor(editor) && editorFolder !== checkedFolder) refresh();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      watch();
      refresh();
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(refresh),
    vscode.window.onDidCloseTerminal((terminal) => {
      if (switchTerminals.delete(terminal)) refresh();
    }),
  );

  watch();
  refresh();
  return { state: () => shown?.kind };
}
