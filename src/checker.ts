import { parseCheckReport } from "./report";
import type { RunResult } from "./run";
import { failedView, missingView, outdatedView, restrictedView, type View, viewFromReport } from "./state";
import { canCheck, canSwitch, formatVersion, parseVersion, type Version } from "./version";

/** Longest a cloudpin call may take before the item shows the failed state. */
export const TIMEOUT_MS = 20_000;

export interface CheckerDeps {
  /** The absolute path of the cloudpin to run (findCloudpin), or null. */
  findCloudpin(): string | null;
  /** Runs that path with no shell and a TIMEOUT_MS timeout (runFile). */
  run(file: string, args: readonly string[], cwd: string): Promise<RunResult>;
}

export interface CheckContext {
  trusted: boolean;
  /** File-system path of the workspace folder in focus: cloudpin's cwd. */
  folder: string;
}

export type SwitchAction =
  | { kind: "trust" }
  | { kind: "install" }
  | { kind: "terminal"; command: "cloudpin switch" | "cloudpin check" };

type VersionAnswer = { version: Version } | { reason: string };

/**
 * Turns "which cloudpin, which version, what does `check --json` say" into a View,
 * and decides what a click does. The version is read once per cloudpin path, so
 * once per activation unless PATH changes.
 */
export class Checker {
  private known: { path: string; version: Version } | undefined;

  constructor(private readonly deps: CheckerDeps) {}

  async check({ trusted, folder }: CheckContext): Promise<View> {
    if (!trusted) return restrictedView();
    const path = this.deps.findCloudpin();
    if (path === null) return missingView();
    const answer = await this.version(path, folder);
    if ("reason" in answer) return failedView(answer.reason);
    if (!canCheck(answer.version)) return outdatedView(formatVersion(answer.version));

    const result = await this.deps.run(path, ["check", "--json"], folder);
    const problem = runProblem(result, "cloudpin check --json");
    if (problem !== undefined) return failedView(problem);
    // check exits 1 on a mismatch or an invalid pin file and still prints the report.
    const parsed = parseCheckReport(result.stdout);
    if (parsed.ok) return viewFromReport(parsed.report, canSwitch(answer.version));
    if (result.stdout.trim() === "") return failedView(exitReason(result, "cloudpin check --json"));
    return failedView(parsed.reason);
  }

  async switchAction({ trusted, folder }: CheckContext): Promise<SwitchAction> {
    if (!trusted) return { kind: "trust" };
    const path = this.deps.findCloudpin();
    if (path === null) return { kind: "install" };
    const answer = await this.version(path, folder);
    // An unreadable version: run check in the terminal, where its output can be seen.
    if ("reason" in answer) return { kind: "terminal", command: "cloudpin check" };
    if (!canCheck(answer.version)) return { kind: "install" };
    return { kind: "terminal", command: canSwitch(answer.version) ? "cloudpin switch" : "cloudpin check" };
  }

  private async version(path: string, cwd: string): Promise<VersionAnswer> {
    if (this.known?.path === path) return { version: this.known.version };
    const result = await this.deps.run(path, ["--version"], cwd);
    const problem = runProblem(result, "cloudpin --version");
    if (problem !== undefined) return { reason: problem };
    const version = parseVersion(result.stdout);
    if (version === null) {
      return { reason: result.code === 0 ? "cloudpin --version printed no version number" : exitReason(result, "cloudpin --version") };
    }
    this.known = { path, version };
    return { version };
  }
}

function runProblem(result: RunResult, what: string): string | undefined {
  if (result.startError !== undefined) return `could not start ${what} (${result.startError})`;
  if (result.timedOut) return `${what} took longer than ${TIMEOUT_MS / 1000} s`;
  return undefined;
}

/** The exit code and cloudpin's first stderr line: the only output the item ever repeats. */
function exitReason(result: RunResult, what: string): string {
  const line = result.stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l !== "");
  const code = result.code === null ? "without an exit code" : `with code ${result.code}`;
  return `${what} printed nothing and exited ${code}${line !== undefined ? `: ${line.slice(0, 200)}` : ""}`;
}
