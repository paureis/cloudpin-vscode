// The shape `cloudpin check --json` prints, copied from cloudpin's src/check.ts
// (1.2.0). Copied rather than imported: the extension must not depend on the CLI's
// source, only on its JSON.

export type CheckStatus = "match" | "mismatch" | "not-logged-in" | "unknown" | "not-installed" | "unsupported";

/** `problems` and `fix` are the texts cloudpin's guard produces: never a credential value. */
export interface CheckEntry {
  provider: string;
  status: CheckStatus;
  problems: string[];
  fix?: string;
}

export interface CheckReport {
  result: "match" | "mismatch" | "unpinned" | "error";
  path: string | null;
  environment: { name: string; protected: boolean; source: string } | null;
  /** An invalid pin file, or a bad `--only` list. */
  error?: string;
  /** The normalized `--only` list, set only in that strict mode. */
  only?: string[];
  /** Pinned providers, in cloudpin's PROVIDERS order. */
  providers: CheckEntry[];
}

const RESULTS = ["match", "mismatch", "unpinned", "error"];
const STATUSES = ["match", "mismatch", "not-logged-in", "unknown", "not-installed", "unsupported"];

export type Parsed = { ok: true; report: CheckReport } | { ok: false; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

/**
 * Reads `cloudpin check --json` defensively: anything that is not exactly the
 * shape above (a new status, a missing field, a number where a string belongs) is
 * rejected with a short reason, and the extension shows its grey "failed" state.
 * Unknown extra fields are ignored. The returned report is rebuilt field by field,
 * so nothing unexpected travels further.
 */
export function parseCheckReport(stdout: string): Parsed {
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    return { ok: false, reason: "cloudpin check --json did not print JSON" };
  }
  const bad = (what: string): Parsed => ({ ok: false, reason: `cloudpin check --json printed an unexpected ${what}` });
  if (!isObject(data)) return bad("value");
  const { result, path, environment, error, only, providers } = data;
  if (!isString(result) || !RESULTS.includes(result)) return bad("result");
  if (path !== null && !isString(path)) return bad("path");
  if (error !== undefined && !isString(error)) return bad("error");
  if (only !== undefined && !isStringArray(only)) return bad("only list");
  let env: CheckReport["environment"] = null;
  if (environment !== null) {
    if (!isObject(environment)) return bad("environment");
    const { name, protected: isProtected, source } = environment;
    if (!isString(name) || typeof isProtected !== "boolean" || !isString(source)) return bad("environment");
    env = { name, protected: isProtected, source };
  }
  if (!Array.isArray(providers)) return bad("provider list");
  const entries: CheckEntry[] = [];
  for (const entry of providers) {
    if (!isObject(entry)) return bad("provider entry");
    const { provider, status, problems, fix } = entry;
    if (!isString(provider) || !isString(status) || !STATUSES.includes(status) || !isStringArray(problems)) {
      return bad("provider entry");
    }
    if (fix !== undefined && !isString(fix)) return bad("provider entry");
    entries.push({ provider, status: status as CheckStatus, problems: [...problems], ...(fix !== undefined ? { fix } : {}) });
  }
  return {
    ok: true,
    report: {
      result: result as CheckReport["result"],
      path,
      environment: env,
      ...(error !== undefined ? { error } : {}),
      ...(only !== undefined ? { only: [...only] } : {}),
      providers: entries,
    },
  };
}
