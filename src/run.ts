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

/**
 * Runs `file` (an absolute path from findCloudpin) with `args`, without a shell.
 * cross-spawn is what makes this work for npm's `cloudpin.cmd` shim on Windows,
 * which Node refuses to spawn without a shell since CVE-2024-27980: it runs the
 * shim through cmd.exe with every argument escaped. Output is captured and
 * returned, never logged.
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
      child = spawn(file, [...args], { cwd, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
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
