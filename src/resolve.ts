import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { posix, win32 } from "node:path";

export interface ResolveInput {
  /** The extension host's environment. */
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  /** File-system paths of the open workspace folders. */
  workspaceFolders: readonly string[];
  /** True for a file that may be run (see isExecutableFile). */
  isFile: (path: string) => boolean;
  /** The real path of a folder, links and short names resolved (see realPath); may throw. */
  realpath: (path: string) => string;
}

/** `\\?\` and `\\.\` paths (either slash): Win32 device paths that skip normal path handling. */
const DEVICE_PATH = /^[\\/]{2}[?.][\\/]/;

const pathApi = (platform: NodeJS.Platform) => (platform === "win32" ? win32 : posix);

/**
 * The absolute path of the cloudpin to run, or null when PATH has none.
 *
 * The same rules as cloudpin's own `findOnPath` (GHSA-3cf7-5v5w-q5vr), plus one:
 * on Windows Node/libuv, cmd.exe and the `which` lookup inside cross-spawn search
 * the current folder before PATH, and POSIX reads an empty or relative entry as
 * the current folder, so only absolute entries count. And since a repository can
 * put its own folders on PATH (a committed `node_modules/.bin`, a direnv file),
 * any entry inside an open workspace folder is skipped too: a `cloudpin.cmd`
 * planted in the repository must never be what the extension runs. That test
 * compares real paths as well as spellings, so a symlink, junction or 8.3 short
 * name that leads into a workspace folder is skipped too (realpath throwing
 * leaves the spelling alone to decide), and on Windows `\\?\` and `\\.\`
 * device-path entries are dropped outright.
 *
 * On Windows variable names are matched case-insensitively (`Path`, `PathExt`),
 * only names with a PATHEXT extension are tried (not the extensionless script
 * npm writes for Git Bash), and one pair of surrounding quotes is removed from
 * an entry, as cmd.exe does.
 */
export function findCloudpin({ env, platform, workspaceFolders, isFile, realpath }: ResolveInput): string | null {
  const win = platform === "win32";
  const p = pathApi(platform);
  const get = (key: string) => (win ? Object.entries(env).find(([k]) => k.toUpperCase() === key)?.[1] : env[key]);
  const real = (path: string) => {
    try {
      return realpath(path);
    } catch {
      return path;
    }
  };
  const folders = workspaceFolders.map((folder) => ({ folder, real: real(folder) }));
  const insideWorkspace = (dir: string) => {
    const realDir = real(dir);
    return folders.some(
      (f) => isInside(dir, f.folder, platform) || isInside(realDir, f.real, platform) || isInside(realDir, f.folder, platform),
    );
  };
  const dirs = (get("PATH") ?? "")
    .split(win ? ";" : ":")
    .map((dir) => (win && dir.length > 1 && dir.startsWith('"') && dir.endsWith('"') ? dir.slice(1, -1) : dir))
    .filter((dir) => dir !== "" && p.isAbsolute(dir))
    .filter((dir) => !(win && DEVICE_PATH.test(dir)))
    .filter((dir) => !insideWorkspace(dir));
  const exts = win ? (get("PATHEXT") ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = p.join(dir, "cloudpin" + ext);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Whether `path` is `folder` or inside it. Case-insensitive on Windows and macOS,
 * whose file systems usually are: skipping one folder too many is harmless,
 * running a planted file is not.
 */
export function isInside(path: string, folder: string, platform: NodeJS.Platform): boolean {
  const p = pathApi(platform);
  const fold = (s: string) => (platform === "win32" || platform === "darwin" ? s.toLowerCase() : s);
  const rel = p.relative(fold(p.resolve(folder)), fold(p.resolve(path)));
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + p.sep) && !p.isAbsolute(rel));
}

/** The real path, with links, junctions and 8.3 short names resolved by the OS. Throws for a missing path. */
export function realPath(path: string): string {
  return realpathSync.native(path);
}

/** A regular file (following links) that, outside Windows, this process may execute. */
export function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (process.platform !== "win32") accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
