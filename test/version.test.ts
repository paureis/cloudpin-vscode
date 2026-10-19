import { describe, expect, it } from "vitest";
import { canCheck, canSwitch, formatVersion, parseVersion } from "../src/version";

describe("parseVersion", () => {
  it("reads the first line cloudpin --version prints", () => {
    expect(parseVersion("1.2.0\n")).toEqual([1, 2, 0]);
    expect(parseVersion("v1.10.3\r\n")).toEqual([1, 10, 3]);
    expect(parseVersion("  1.3.0-beta.1\nupdate available\n")).toEqual([1, 3, 0]);
  });

  it("returns null for anything else", () => {
    expect(parseVersion("")).toBeNull();
    expect(parseVersion("cloudpin 1.2.0")).toBeNull();
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("\n1.2.0")).toBeNull();
  });
});

describe("version gate", () => {
  it("needs 1.2.0 for check --json", () => {
    expect(canCheck([1, 1, 9])).toBe(false);
    expect(canCheck([1, 2, 0])).toBe(true);
    expect(canCheck([1, 10, 0])).toBe(true);
    expect(canCheck([0, 9, 9])).toBe(false);
    expect(canCheck([2, 0, 0])).toBe(true);
  });

  it("needs 1.3.0 for switch", () => {
    expect(canSwitch([1, 2, 9])).toBe(false);
    expect(canSwitch([1, 3, 0])).toBe(true);
    expect(canSwitch([2, 0, 0])).toBe(true);
  });

  it("formats a version", () => {
    expect(formatVersion([1, 2, 3])).toBe("1.2.3");
  });
});
