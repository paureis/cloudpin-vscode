import { describe, expect, it } from "vitest";
import { findCloudpin, isInside } from "../src/resolve";

const files = (...paths: string[]) => {
  const set = new Set(paths);
  return (path: string) => set.has(path);
};

describe("findCloudpin on POSIX", () => {
  const base = { platform: "linux" as const, workspaceFolders: [] as string[] };

  it("finds cloudpin on the first PATH entry that has it", () => {
    const found = findCloudpin({
      ...base,
      env: { PATH: "/usr/bin:/opt/node/bin:/usr/local/bin" },
      isFile: files("/opt/node/bin/cloudpin", "/usr/local/bin/cloudpin"),
    });
    expect(found).toBe("/opt/node/bin/cloudpin");
  });

  it("skips empty and relative entries, which POSIX reads as the current folder", () => {
    const found = findCloudpin({
      ...base,
      env: { PATH: ":.:bin:./node_modules/.bin::/usr/bin" },
      isFile: files("cloudpin", "./cloudpin", "bin/cloudpin", "./node_modules/.bin/cloudpin", "/usr/bin/cloudpin"),
    });
    expect(found).toBe("/usr/bin/cloudpin");
  });

  it("never chooses a cloudpin inside an open workspace folder, even when it is first on PATH", () => {
    const env = { PATH: "/home/dev/repo/node_modules/.bin:/home/dev/repo:/usr/local/bin" };
    const isFile = files("/home/dev/repo/node_modules/.bin/cloudpin", "/home/dev/repo/cloudpin", "/usr/local/bin/cloudpin");
    // Control: without the workspace folder the planted file wins, so the skip is what changes the answer.
    expect(findCloudpin({ ...base, env, isFile })).toBe("/home/dev/repo/node_modules/.bin/cloudpin");
    expect(findCloudpin({ ...base, env, isFile, workspaceFolders: ["/home/dev/repo"] })).toBe("/usr/local/bin/cloudpin");
  });

  it("does not skip a folder that only shares a name prefix with a workspace folder", () => {
    const found = findCloudpin({
      ...base,
      env: { PATH: "/home/dev/repo-tools/bin" },
      workspaceFolders: ["/home/dev/repo"],
      isFile: files("/home/dev/repo-tools/bin/cloudpin"),
    });
    expect(found).toBe("/home/dev/repo-tools/bin/cloudpin");
  });

  it("returns null when cloudpin is on no usable entry", () => {
    expect(findCloudpin({ ...base, env: { PATH: "/usr/bin" }, isFile: () => false })).toBeNull();
    expect(findCloudpin({ ...base, env: {}, isFile: () => true })).toBeNull();
  });

  it("treats PATH case-sensitively outside Windows", () => {
    expect(findCloudpin({ ...base, env: { Path: "/usr/bin" }, isFile: () => true })).toBeNull();
  });
});

describe("findCloudpin on Windows", () => {
  const base = { platform: "win32" as const, workspaceFolders: [] as string[] };

  it("tries each PATHEXT extension and reads Path and PathExt in any case", () => {
    const found = findCloudpin({
      ...base,
      env: { Path: "C:\\Windows;C:\\Users\\dev\\AppData\\Roaming\\npm", PathExt: ".EXE;.CMD" },
      isFile: files("C:\\Users\\dev\\AppData\\Roaming\\npm\\cloudpin.CMD"),
    });
    expect(found).toBe("C:\\Users\\dev\\AppData\\Roaming\\npm\\cloudpin.CMD");
  });

  it("ignores the extensionless script npm writes for Git Bash", () => {
    const found = findCloudpin({
      ...base,
      env: { PATH: "C:\\npm", PATHEXT: ".COM;.EXE;.BAT;.CMD" },
      isFile: files("C:\\npm\\cloudpin"),
    });
    expect(found).toBeNull();
  });

  it("uses the default PATHEXT when it is unset", () => {
    const found = findCloudpin({ ...base, env: { PATH: "C:\\npm" }, isFile: files("C:\\npm\\cloudpin.CMD") });
    expect(found).toBe("C:\\npm\\cloudpin.CMD");
  });

  it("skips relative entries and removes one pair of surrounding quotes", () => {
    const found = findCloudpin({
      ...base,
      env: { PATH: ".;node_modules\\.bin;;\"C:\\Program Files\\nodejs\"", PATHEXT: ".CMD" },
      isFile: files(".\\cloudpin.CMD", "node_modules\\.bin\\cloudpin.CMD", "C:\\Program Files\\nodejs\\cloudpin.CMD"),
    });
    expect(found).toBe("C:\\Program Files\\nodejs\\cloudpin.CMD");
  });

  it("skips entries inside a workspace folder whatever their casing", () => {
    const env = { PATH: "c:\\work\\REPO\\node_modules\\.bin;C:\\npm", PATHEXT: ".CMD" };
    const isFile = files("c:\\work\\REPO\\node_modules\\.bin\\cloudpin.CMD", "C:\\npm\\cloudpin.CMD");
    expect(findCloudpin({ ...base, env, isFile })).toBe("c:\\work\\REPO\\node_modules\\.bin\\cloudpin.CMD");
    expect(findCloudpin({ ...base, env, isFile, workspaceFolders: ["C:\\Work\\repo"] })).toBe("C:\\npm\\cloudpin.CMD");
  });
});

describe("isInside", () => {
  it("counts the folder itself and its descendants", () => {
    expect(isInside("/a/b", "/a/b", "linux")).toBe(true);
    expect(isInside("/a/b/c/", "/a/b", "linux")).toBe(true);
    expect(isInside("/a/bc", "/a/b", "linux")).toBe(false);
    expect(isInside("/a", "/a/b", "linux")).toBe(false);
    expect(isInside("/a/b/..bin", "/a/b", "linux")).toBe(true);
  });

  it("compares Windows paths case-insensitively and across drives", () => {
    expect(isInside("C:\\A\\B\\bin", "c:\\a\\b", "win32")).toBe(true);
    expect(isInside("D:\\a\\b", "C:\\a\\b", "win32")).toBe(false);
  });
});
