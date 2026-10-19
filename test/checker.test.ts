import { describe, expect, it } from "vitest";
import { Checker, type CheckerDeps } from "../src/checker";
import { pickFolder } from "../src/folder";
import type { RunResult } from "../src/run";

const ok = (stdout: string, code = 0): RunResult => ({ code, stdout, stderr: "", timedOut: false });
const MATCH = JSON.stringify({
  result: "match",
  path: "/w/.cloudpin.yml",
  environment: null,
  providers: [{ provider: "azure", status: "match", problems: [] }],
});

function fake(opts: { path?: string | null; version?: RunResult; check?: RunResult }) {
  const calls: { file: string; args: readonly string[]; cwd: string }[] = [];
  const deps: CheckerDeps = {
    findCloudpin: () => (opts.path === undefined ? "/usr/bin/cloudpin" : opts.path),
    run: async (file, args, cwd) => {
      calls.push({ file, args, cwd });
      return args[0] === "--version" ? (opts.version ?? ok("1.3.0\n")) : (opts.check ?? ok(MATCH));
    },
  };
  return { deps, calls };
}

const ctx = { trusted: true, folder: "/w" };

describe("Checker.check", () => {
  it("runs the resolved path with check --json in the folder in focus", async () => {
    const f = fake({});
    const view = await new Checker(f.deps).check(ctx);
    expect(view.kind).toBe("match");
    expect(f.calls).toEqual([
      { file: "/usr/bin/cloudpin", args: ["--version"], cwd: "/w" },
      { file: "/usr/bin/cloudpin", args: ["check", "--json"], cwd: "/w" },
    ]);
  });

  it("reads the version once per cloudpin path", async () => {
    const f = fake({});
    const checker = new Checker(f.deps);
    await checker.check(ctx);
    await checker.check(ctx);
    expect(f.calls.filter((c) => c.args[0] === "--version")).toHaveLength(1);
  });

  it("spawns nothing in Restricted Mode", async () => {
    const f = fake({});
    let looked = false;
    f.deps.findCloudpin = () => {
      looked = true;
      return "/usr/bin/cloudpin";
    };
    const view = await new Checker(f.deps).check({ trusted: false, folder: "/w" });
    expect(view.kind).toBe("restricted");
    expect(f.calls).toEqual([]);
    expect(looked).toBe(false);
  });

  it("cloudpin not found", async () => {
    const f = fake({ path: null });
    expect((await new Checker(f.deps).check(ctx)).kind).toBe("missing");
    expect(f.calls).toEqual([]);
  });

  it("cloudpin older than 1.2.0 is not asked to check", async () => {
    const f = fake({ version: ok("1.1.1\n") });
    const view = await new Checker(f.deps).check(ctx);
    expect(view.kind).toBe("outdated");
    expect(view.label).toContain("1.1.1");
    expect(f.calls).toHaveLength(1);
  });

  it("an unreadable version is the failed state", async () => {
    expect((await new Checker(fake({ version: ok("hello") }).deps).check(ctx)).kind).toBe("failed");
    const view = await new Checker(fake({ version: { code: 2, stdout: "", stderr: "\n  boom: broken install\nmore\n", timedOut: false } }).deps).check(ctx);
    expect(view.kind).toBe("failed");
    expect(view.hover).toContain("boom\\: broken install");
    expect(view.hover).not.toContain("more");
  });

  it("a mismatch exits 1 and is still read", async () => {
    const stdout = JSON.stringify({
      result: "mismatch",
      path: "/w/.cloudpin.yml",
      environment: null,
      providers: [{ provider: "azure", status: "mismatch", problems: ["wrong one"], fix: "az account set" }],
    });
    const view = await new Checker(fake({ check: ok(stdout, 1) }).deps).check(ctx);
    expect(view.kind).toBe("mismatch");
  });

  it("start errors, timeouts, empty and malformed output are the failed state", async () => {
    const cases: [RunResult, string][] = [
      [{ code: null, stdout: "", stderr: "", timedOut: false, startError: "EACCES" }, "could not start cloudpin check \\-\\-json \\(EACCES\\)"],
      [{ code: null, stdout: "", stderr: "", timedOut: true }, "took longer than 20 s"],
      [{ code: 1, stdout: "", stderr: "cloudpin check: unknown argument\n", timedOut: false }, "exited with code 1\\: cloudpin check\\: unknown argument"],
      [ok("{ not json"), "did not print JSON"],
      [ok(JSON.stringify({ result: "match" })), "unexpected path"],
    ];
    for (const [check, expected] of cases) {
      const view = await new Checker(fake({ check }).deps).check(ctx);
      expect(view.kind, expected).toBe("failed");
      expect(view.hover, expected).toContain(expected);
    }
  });
});

describe("Checker.switchAction", () => {
  it("asks for trust in Restricted Mode", async () => {
    expect(await new Checker(fake({}).deps).switchAction({ trusted: false, folder: "/w" })).toEqual({ kind: "trust" });
  });

  it("opens the install page when cloudpin is missing or older than 1.2.0", async () => {
    expect(await new Checker(fake({ path: null }).deps).switchAction(ctx)).toEqual({ kind: "install" });
    expect(await new Checker(fake({ version: ok("1.1.0") }).deps).switchAction(ctx)).toEqual({ kind: "install" });
  });

  it("sends switch from 1.3.0 and check before it", async () => {
    expect(await new Checker(fake({ version: ok("1.3.0") }).deps).switchAction(ctx)).toEqual({ kind: "terminal", command: "cloudpin switch", path: "/usr/bin/cloudpin" });
    expect(await new Checker(fake({ version: ok("1.2.4") }).deps).switchAction(ctx)).toEqual({ kind: "terminal", command: "cloudpin check", path: "/usr/bin/cloudpin" });
    expect(await new Checker(fake({ version: ok("garbage") }).deps).switchAction(ctx)).toEqual({ kind: "terminal", command: "cloudpin check", path: "/usr/bin/cloudpin" });
  });
});

describe("pickFolder", () => {
  const folders = ["/a", "/b", "/c"];
  const pinned = (f: string) => f === "/b";

  it("prefers the active editor's folder", () => {
    expect(pickFolder("/c", folders, pinned)).toBe("/c");
  });

  it("else the first folder with a pin file, else the first folder", () => {
    expect(pickFolder(undefined, folders, pinned)).toBe("/b");
    expect(pickFolder("/gone", folders, pinned)).toBe("/b");
    expect(pickFolder(undefined, folders, () => false)).toBe("/a");
    expect(pickFolder(undefined, [], pinned)).toBeUndefined();
  });
});
