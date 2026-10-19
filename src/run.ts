import spawn from "cross-spawn";

export interface RunResult {
  /** Exit code, or null when the process did not exit normally. */
  code: number | null;
  stdout: string;
  stderr: string;
  /** Set when the process could not start (ENOENT, EACCES, ...). */
  startError?: string;
  timedOut: boolean;
}

export interface RunOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

/** Output beyond this is dropped; `check --json` prints a few kilobytes. */
const MAX_OUTPUT = 1024 * 1024;

const NO_CWD_SEARCH = "NoDefaultCurrentDirectoryInExePath";

/**
 * The environment a child process (or the switch terminal) gets. On Windows it
 * also sets NoDefaultCurrentDirectoryInExePath, which makes cmd.exe and libuv
 * skip the current folder when they look up a bare command name (Microsoft docs
 * for NeedCurrentDirectoryForExePathW). Running cloudpin by its full path only
 * covers the first step: npm's cloudpin.cmd then runs a bare `node` when no
 * node.exe sits beside the shim, and that lookup happens inside the child, whose
 * current folder is the workspace (the same fix as cloudpin 1.1.2's childEnv,
 * GHSA-3cf7-5v5w-q5vr). Windows variable names are case-insensitive and Node
 * keeps only one key per name, chosen by sort order, so any other casing is
 * dropped before the canonical key is set. `env` itself is never changed.
 */
export function childEnv(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): NodeJS.ProcessEnv {
  if (platform !== "win32") return env;
  const upper = NO_CWD_SEARCH.toUpperCase();
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) {
    if (k.toUpperCase() !== upper) out[k] = v;
  }
  out[NO_CWD_SEARCH] = "1";
  return out;
}

/**
 * Runs `file` (an absolute path from findCloudpin) with `args`, without a shell.
 * cross-spawn is what makes this work for npm's `cloudpin.cmd` shim on Windows,
 * which Node refuses to spawn without a shell since CVE-2024-27980: it runs the
 * shim through cmd.exe with every argument escaped. The child gets `childEnv(env)`
 * so nothing it starts is looked up in `cwd`. Output is captured and returned,
 * never logged.
 */
export function runFile(file: string, args: readonly string[], { cwd, env, timeoutMs }: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (code: number | null, startError?: string) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, ...(startError !== undefined ? { startError } : {}) });
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(file, [...args], { cwd, env: childEnv(env, process.platform), shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      finish(null, describe(err));
      return;
    }
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      finish(null);
    }, timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk;
    });
    child.on("error", (err) => finish(null, describe(err)));
    child.on("close", (code) => finish(code));
  });
}

function describe(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && typeof err.code === "string") return err.code;
  return err instanceof Error ? err.message : String(err);
}
