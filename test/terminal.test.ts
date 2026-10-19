import { describe, expect, it } from "vitest";
import { isCmdShell, terminalCommand } from "../src/terminal";

const NPM = "C:\\Users\\dev\\AppData\\Roaming\\npm\\cloudpin.cmd";

describe("terminalCommand", () => {
  it("sends the resolved path in double quotes when the shell is cmd.exe", () => {
    expect(terminalCommand({ command: "cloudpin switch", path: NPM }, "C:\\Windows\\System32\\cmd.exe")).toBe(
      '"C:\\Users\\dev\\AppData\\Roaming\\npm\\cloudpin.cmd" switch',
    );
    expect(terminalCommand({ command: "cloudpin check", path: NPM }, "C:\\Windows\\System32\\CMD.EXE")).toBe(
      '"C:\\Users\\dev\\AppData\\Roaming\\npm\\cloudpin.cmd" check',
    );
  });

  it("keeps the name for every other shell, which needs the cloudpin shell function", () => {
    for (const shell of [
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "/bin/zsh",
      "/usr/bin/bash",
      "",
    ]) {
      expect(terminalCommand({ command: "cloudpin switch", path: NPM }, shell)).toBe("cloudpin switch");
    }
  });
});

describe("isCmdShell", () => {
  it("matches cmd.exe or cmd by base name, in any case and either slash", () => {
    expect(isCmdShell("C:\\Windows\\System32\\cmd.exe")).toBe(true);
    expect(isCmdShell("C:/Windows/System32/Cmd.Exe")).toBe(true);
    expect(isCmdShell("cmd")).toBe(true);
    expect(isCmdShell("CMD")).toBe(true);
    expect(isCmdShell("C:\\tools\\cmder.exe")).toBe(false);
    expect(isCmdShell("C:\\cmd\\pwsh.exe")).toBe(false);
    expect(isCmdShell("/bin/bash")).toBe(false);
  });
});
