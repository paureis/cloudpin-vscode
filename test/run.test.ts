import { describe, expect, it } from "vitest";
import { childEnv } from "../src/run";

const KEY = "NoDefaultCurrentDirectoryInExePath";

describe("childEnv", () => {
  it("sets NoDefaultCurrentDirectoryInExePath on Windows and keeps everything else", () => {
    const env = childEnv({ Path: "C:\\npm", FOO: "bar" }, "win32");
    expect(env).toEqual({ Path: "C:\\npm", FOO: "bar", [KEY]: "1" });
  });

  it("leaves exactly one key on Windows, whatever casing the variable had", () => {
    const env = childEnv({ NODEFAULTCURRENTDIRECTORYINEXEPATH: "0", nodefaultcurrentdirectoryinexepath: "", A: "1" }, "win32");
    expect(Object.keys(env).filter((k) => k.toUpperCase() === KEY.toUpperCase())).toEqual([KEY]);
    expect(env[KEY]).toBe("1");
    expect(env.A).toBe("1");
  });

  it("does not change the environment it was given", () => {
    const original = { [KEY.toUpperCase()]: "0" };
    childEnv(original, "win32");
    expect(original).toEqual({ [KEY.toUpperCase()]: "0" });
  });

  it("returns the environment untouched elsewhere", () => {
    const env = { PATH: "/usr/bin" };
    expect(childEnv(env, "linux")).toEqual({ PATH: "/usr/bin" });
    expect(childEnv(env, "darwin")).toEqual({ PATH: "/usr/bin" });
  });
});
