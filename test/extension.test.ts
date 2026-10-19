import type * as vscode from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Checker } from "../src/checker";
import { activateWith } from "../src/extension";
import type { RunResult } from "../src/run";
import { INSTALL_URL } from "../src/state";
import { env, events, folder, recorded, reset, Uri, workspace, window } from "./fake-vscode";

const MATCH = JSON.stringify({
  result: "match",
  path: "/w/a/.cloudpin.yml",
  environment: null,
  providers: [{ provider: "azure", status: "match", problems: [] }],
});

let checks: string[];
let version: string;
let found: string | null;
let now: number;
let platform: NodeJS.Platform;
/** What `check --json` answers in a folder; a test can replace it to hold a check open. */
let answer: (cwd: string) => Promise<string>;

function start() {
  const checker = new Checker({
    findCloudpin: () => found,
    run: async (_file, args, cwd): Promise<RunResult> => {
      if (args[0] === "--version") return { code: 0, stdout: `${version}\n`, stderr: "", timedOut: false };
      checks.push(cwd);
      return { code: 0, stdout: await answer(cwd), stderr: "", timedOut: false };
    },
  });
  const context = { subscriptions: [] as { dispose(): unknown }[] };
  const api = activateWith(context as unknown as vscode.ExtensionContext, {
    checker,
    hasPinFile: (f) => f === "/w/a",
    now: () => now,
    platform,
  });
  return { api, context, item: recorded.items[0]! };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  reset();
  checks = [];
  version = "1.3.0";
  found = "/usr/bin/cloudpin";
  now = 1_000_000;
  platform = "linux";
  answer = async () => MATCH;
  workspace.workspaceFolders = [folder("/w/a", 0), folder("/w/b", 1)];
});

describe("activation", () => {
  it("shows the item with its name, colours, accessible label and an untrusted hover", async () => {
    const { api, item } = start();
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    expect(item.id).toBe("cloudpin.status");
    expect(item.name).toBe("cloudpin");
    expect(item.command).toBe("cloudpin.switch");
    expect(item.visible).toBe(true);
    expect(item.text).toBe("$(pinned) cloudpin");
    expect(item.color?.id).toBe("testing.iconPassed");
    expect(item.backgroundColor).toBeUndefined();
    expect(item.accessibilityInformation?.label).toBe("cloudpin: every pinned account matches");
    expect(item.tooltip?.isTrusted).toBe(false);
    expect(item.tooltip?.supportHtml).toBe(false);
    expect(item.tooltip?.supportThemeIcons).toBe(false);
    expect(checks).toEqual(["/w/a"]);
  });

  it("registers both commands and a pin-file and a git HEAD watcher per folder", () => {
    start();
    expect([...recorded.commands.keys()].sort()).toEqual(["cloudpin.refresh", "cloudpin.switch"]);
    expect(recorded.watchers.map((w) => [w.pattern.base.uri.fsPath, w.pattern.pattern])).toEqual([
      ["/w/a", ".cloudpin.yml"],
      ["/w/a", ".git/HEAD"],
      ["/w/b", ".cloudpin.yml"],
      ["/w/b", ".git/HEAD"],
    ]);
  });
});

describe("refreshes", () => {
  it("when the pin file changes, and on the refresh command", async () => {
    const { api } = start();
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    recorded.watchers[0]!.change.fire(Uri.file("/w/a/.cloudpin.yml"));
    await vi.waitFor(() => expect(checks).toHaveLength(2));
    await recorded.commands.get("cloudpin.refresh")!();
    expect(checks).toHaveLength(3);
  });

  it("on window focus at most once every 30 s", async () => {
    const { api } = start();
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    now += 10_000;
    events.windowState.fire({ focused: true });
    await settle();
    expect(checks).toHaveLength(1);
    now += 25_000;
    events.windowState.fire({ focused: false });
    await settle();
    expect(checks).toHaveLength(1);
    events.windowState.fire({ focused: true });
    await vi.waitFor(() => expect(checks).toHaveLength(2));
  });

  it("when the active editor moves to another folder, and checks there", async () => {
    const { api } = start();
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    events.activeEditor.fire({ document: { uri: Uri.file("/w/a/x.ts") } });
    await settle();
    expect(checks).toEqual(["/w/a"]);
    events.activeEditor.fire({ document: { uri: Uri.file("/w/b/y.ts") } });
    await vi.waitFor(() => expect(checks).toEqual(["/w/a", "/w/b"]));
    // No editor (focus in a terminal) keeps the last folder.
    events.activeEditor.fire(undefined);
    await recorded.commands.get("cloudpin.refresh")!();
    expect(checks).toEqual(["/w/a", "/w/b", "/w/b"]);
  });

  it("when workspace folders change, rebuilding the watchers", async () => {
    const { api } = start();
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    workspace.workspaceFolders = [folder("/w/a", 0)];
    events.folders.fire({});
    await vi.waitFor(() => expect(checks).toHaveLength(2));
    expect(recorded.watchers.filter((w) => !w.disposed)).toHaveLength(2);
  });

  it("when the git branch changes (branches: picks the environment), coalesced", async () => {
    const { api } = start();
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    const head = recorded.watchers.find((w) => w.pattern.base.uri.fsPath === "/w/a" && w.pattern.pattern === ".git/HEAD")!;
    head.change.fire(Uri.file("/w/a/.git/HEAD"));
    await vi.waitFor(() => expect(checks).toHaveLength(2));
    head.create.fire(Uri.file("/w/a/.git/HEAD"));
    await vi.waitFor(() => expect(checks).toHaveLength(3));
    // A checkout writes HEAD more than once: one check runs, one more after it, not one per write.
    head.change.fire(Uri.file("/w/a/.git/HEAD"));
    head.change.fire(Uri.file("/w/a/.git/HEAD"));
    head.change.fire(Uri.file("/w/a/.git/HEAD"));
    await vi.waitFor(() => expect(checks).toHaveLength(5));
    await settle();
    expect(checks).toHaveLength(5);
  });

  it("drops a check that finishes after the focus moved to another folder", async () => {
    const held = new Map<string, (stdout: string) => void>();
    answer = (cwd) => new Promise((resolve) => held.set(cwd, resolve));
    const { api, item } = start();
    await vi.waitFor(() => expect(held.has("/w/a")).toBe(true));
    // The user moves to folder b while a's check is still running.
    events.activeEditor.fire({ document: { uri: Uri.file("/w/b/y.ts") } });
    const mismatch = JSON.stringify({
      result: "mismatch",
      path: "/w/a/.cloudpin.yml",
      environment: null,
      providers: [{ provider: "azure", status: "mismatch", problems: ["another subscription"] }],
    });
    held.get("/w/a")!(mismatch);
    // b's check is running and held open: a's late result must not be on the item meanwhile.
    await vi.waitFor(() => expect(held.has("/w/b")).toBe(true));
    expect(api.state()).toBeUndefined();
    expect(item.visible).toBe(false);
    held.get("/w/b")!(MATCH);
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    expect(checks).toEqual(["/w/a", "/w/b"]);
  });
});

describe("Restricted Mode", () => {
  it("spawns nothing until trust is granted", async () => {
    workspace.isTrusted = false;
    const { api, item } = start();
    await vi.waitFor(() => expect(api.state()).toBe("restricted"));
    expect(item.text).toBe("$(shield) cloudpin");
    expect(checks).toEqual([]);
    await recorded.commands.get("cloudpin.switch")!();
    expect(recorded.executed).toEqual(["workbench.trust.manage"]);
    expect(recorded.terminals).toEqual([]);

    workspace.isTrusted = true;
    events.trust.fire();
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    expect(checks).toEqual(["/w/a"]);
  });
});

describe("the switch command", () => {
  it("opens a transient terminal in the folder, sends cloudpin switch, and refreshes when it closes", async () => {
    const { api } = start();
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    await recorded.commands.get("cloudpin.switch")!();
    const terminal = recorded.terminals[0]!;
    expect(terminal.options.name).toBe("cloudpin switch");
    expect(terminal.options.cwd.fsPath).toBe("/w/a");
    expect(terminal.options.isTransient).toBe(true);
    expect(terminal.shown).toBe(true);
    expect(terminal.sent).toEqual(["cloudpin switch"]);

    events.closeTerminal.fire({ ...terminal }); // some other terminal: no refresh
    await settle();
    expect(checks).toHaveLength(1);
    terminal.dispose();
    await vi.waitFor(() => expect(checks).toHaveLength(2));
  });

  it("on Windows gives the terminal NoDefaultCurrentDirectoryInExePath, and nothing extra elsewhere", async () => {
    const { api } = start();
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    await recorded.commands.get("cloudpin.switch")!();
    expect(recorded.terminals[0]!.options.env).toBeUndefined();

    reset();
    workspace.workspaceFolders = [folder("/w/a", 0)];
    platform = "win32";
    const second = start();
    await vi.waitFor(() => expect(second.api.state()).toBe("match"));
    await recorded.commands.get("cloudpin.switch")!();
    expect(recorded.terminals[0]!.options.env).toEqual({ NoDefaultCurrentDirectoryInExePath: "1" });
  });

  it("sends the resolved path in quotes when the terminal's shell is cmd.exe", async () => {
    env.shell = "C:\\Windows\\System32\\cmd.exe";
    found = "C:\\Users\\dev\\AppData\\Roaming\\npm\\cloudpin.cmd";
    const { api } = start();
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    await recorded.commands.get("cloudpin.switch")!();
    expect(recorded.terminals[0]!.sent).toEqual(['"C:\\Users\\dev\\AppData\\Roaming\\npm\\cloudpin.cmd" switch']);
  });

  it("sends cloudpin check before cloudpin 1.3.0", async () => {
    version = "1.2.0";
    const { api } = start();
    await vi.waitFor(() => expect(api.state()).toBe("match"));
    await recorded.commands.get("cloudpin.switch")!();
    expect(recorded.terminals[0]!.sent).toEqual(["cloudpin check"]);
  });

  it("opens the install instructions when cloudpin is missing", async () => {
    found = null;
    const { api, item } = start();
    await vi.waitFor(() => expect(api.state()).toBe("missing"));
    expect(item.text).toBe("$(circle-slash) cloudpin");
    await recorded.commands.get("cloudpin.switch")!();
    expect(recorded.opened).toEqual([INSTALL_URL]);
    expect(recorded.terminals).toEqual([]);
  });
});

it("hides the item when no folder is open", async () => {
  workspace.workspaceFolders = [];
  window.activeTextEditor = undefined;
  const { api, item } = start();
  await settle();
  expect(api.state()).toBeUndefined();
  expect(item.visible).toBe(false);
});
