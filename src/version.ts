export type Version = readonly [major: number, minor: number, patch: number];

/** `cloudpin check --json` exists from 1.2.0. */
export const CHECK_VERSION: Version = [1, 2, 0];
/** `cloudpin switch` exists from 1.3.0. */
export const SWITCH_VERSION: Version = [1, 3, 0];

/**
 * The version on the first line of `cloudpin --version` ("1.2.0"). A pre-release
 * suffix is ignored, so 1.3.0-beta.1 counts as 1.3.0.
 */
export function parseVersion(stdout: string): Version | null {
  const first = stdout.split(/\r?\n/, 1)[0]!.trim();
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]*)?$/.exec(first);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function atLeast(v: Version, min: Version): boolean {
  for (let i = 0; i < 3; i++) {
    if (v[i]! !== min[i]!) return v[i]! > min[i]!;
  }
  return true;
}

export const canCheck = (v: Version): boolean => atLeast(v, CHECK_VERSION);
export const canSwitch = (v: Version): boolean => atLeast(v, SWITCH_VERSION);
export const formatVersion = (v: Version): string => v.join(".");
