// The one test that spawns real processes: a tiny fake `cloudpin` this test
// writes into temporary folders (never a real cloud CLI, never the real cloudpin).
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Checker, TIMEOUT_MS } from "../src/checker";
import { findCloudpin, isExecutableFile, realPath } from "../src/resolve";
import { runFile } from "../src/run";

const root = mkdtempSync(join(tmpdir(), "cloudpin-vscode-"));
// Retries: on Windows a just-killed child can hold the folder for a moment (EBUSY).
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

/** Writes a fake cloudpin into `dir` that answers --version and check --json. */
function fakeCloudpin(dir: string, version: string, report: object): void {
  mkdirSync(dir, { recursive: true });
  const script = join(dir, "fake-cloudpin.js");
  writeFileSync(
    script,
    [
      `const args = process.argv.slice(2);`,
      `if (args[0] === "--version") { console.log(${JSON.stringify(version)}); }`,
      `else if (args[0] === "check" && args[1] === "--json") {`,
      `  console.log(JSON.stringify(Object.assign(${JSON.stringify(report)}, { cwd: process.cwd(), args })));`,
      `  process.exitCode = 1;`,
      `} else { console.error("unexpected arguments"); process.exitCode = 2; }`,
    ].join("\n"),
  );
  if (process.platform === "win32") {
    writeFileSync(join(dir, "cloudpin.cmd"), `@"${process.execPath}" "%~dp0fake-cloudpin.js" %*\r\n`);
  } else {
    const sh = join(dir, "cloudpin");
    writeFileSync(sh, `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/fake-cloudpin.js" "$@"\n`);
    chmodSync(sh, 0o755);
  }
}

const report = (status: string) => ({
  result: status === "match" ? "match" : "mismatch",
  path: "x/.cloudpin.yml",
  environment: null,
  providers: [{ provider: "azure", status, problems: status === "match" ? [] : ["planted"] }],
});

describe("with a real process", () => {
  const trusted = join(root, "bin");
  const workspace = join(root, "my repo");
  const planted = join(workspace, "node_modules", ".bin");
  fakeCloudpin(trusted, "1.3.0", report("match"));
  fakeCloudpin(planted, "9.9.9", report("mismatch"));
  mkdirSync(workspace, { recursive: true });
  // The planted copy comes first on PATH, and the current folder is the workspace.
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Windows copies of the environment may spell it Path; keep exactly one entry.
  for (const k of Object.keys(env)) if (k.toUpperCase() === "PATH") delete env[k];
  env.PATH = [planted, trusted, process.env.PATH ?? ""].join(delimiter);

  it("resolves the cloudpin outside the workspace and reads its report", async () => {
    // Control: without the workspace folder, the planted copy is what PATH finds.
    const naive = findCloudpin({ env, platform: process.platform, workspaceFolders: [], isFile: isExecutableFile, realpath: realPath });
    expect(naive?.startsWith(planted)).toBe(true);

    const path = findCloudpin({ env, platform: process.platform, workspaceFolders: [workspace], isFile: isExecutableFile, realpath: realPath });
    expect(path?.startsWith(trusted)).toBe(true);

    const checker = new Checker({
      findCloudpin: () => path,
      run: (file, args, cwd) => runFile(file, args, { cwd, env, timeoutMs: TIMEOUT_MS }),
    });
    const view = await checker.check({ trusted: true, folder: workspace });
    expect(view.kind).toBe("match");
  });

  it("passes arguments without a shell and runs in the given folder", async () => {
    const path = findCloudpin({ env, platform: process.platform, workspaceFolders: [workspace], isFile: isExecutableFile, realpath: realPath })!;
    const result = await runFile(path, ["check", "--json"], { cwd: workspace, env, timeoutMs: TIMEOUT_MS });
    expect(result.code).toBe(1);
    const out = JSON.parse(result.stdout) as { cwd: string; args: string[] };
    expect(out.args).toEqual(["check", "--json"]);
    expect(out.cwd.toLowerCase()).toBe(workspace.toLowerCase());
  });

  // npm's cloudpin.cmd runs a bare `node` when no node.exe sits beside it, and
  // cmd.exe looks for a bare name in the current folder (the workspace) before
  // PATH unless NoDefaultCurrentDirectoryInExePath is set (GHSA-3cf7-5v5w-q5vr).
  it.runIf(process.platform === "win32")("an npm-style shim's bare command comes from PATH, not the workspace", async () => {
    const helper = "cloudpin-vscode-helper";
    const shimDir = join(root, "shim");
    const helperDir = join(root, "helper");
    const repo = join(root, "shim repo");
    for (const dir of [shimDir, helperDir, repo]) mkdirSync(dir, { recursive: true });
    // The shape of npm's cmd-shim: the program name goes through a variable and runs unqualified.
    writeFileSync(
      join(shimDir, "cloudpin.cmd"),
      ["@ECHO off", "SETLOCAL", `SET "_prog=${helper}"`, `endLocal & "%_prog%" %*`, ""].join("\r\n"),
    );
    writeFileSync(join(helperDir, `${helper}.cmd`), "@echo from-path\r\n");
    writeFileSync(join(repo, `${helper}.cmd`), "@echo planted\r\n");

    const shimEnv: NodeJS.ProcessEnv = { ...process.env };
    // Deleted in every casing: a machine that sets it globally would hide the bug.
    for (const k of Object.keys(shimEnv)) {
      if (k.toUpperCase() === "PATH" || k.toUpperCase() === "NODEFAULTCURRENTDIRECTORYINEXEPATH") delete shimEnv[k];
    }
    shimEnv.PATH = [helperDir, process.env.PATH ?? ""].join(delimiter);

    const result = await runFile(join(shimDir, "cloudpin.cmd"), [], { cwd: repo, env: shimEnv, timeoutMs: TIMEOUT_MS });
    expect(result.stdout.trim()).toBe("from-path");
  });

  it("reports a start error and a timeout", async () => {
    const missing = await runFile(join(root, "nope", process.platform === "win32" ? "cloudpin.cmd" : "cloudpin"), [], {
      cwd: root,
      env,
      timeoutMs: TIMEOUT_MS,
    });
    expect(missing.code === null ? missing.startError : missing.code).toBeTruthy();

    const slow = await runFile(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { cwd: tmpdir(), env, timeoutMs: 200 });
    expect(slow.timedOut).toBe(true);
    expect(slow.code).toBeNull();
  });
});
