// Electron smoke test (`npm run test:smoke`, not part of `npm test`): starts a
// real VS Code with the built extension in a temporary folder that has a pin
// file, and a fake `cloudpin` on PATH that this script writes (never a real
// cloud CLI, never the real cloudpin). test/smoke/index.cjs then checks that the
// extension activated on its own and that its item shows "match".
//
// The control: a second fake that answers "mismatch" sits inside the workspace
// folder and comes FIRST on PATH. If the extension ever ran it, the item would
// show "mismatch" and the test would fail.
//
// Environment:
//   CLOUDPIN_SMOKE_VSCODE  VS Code version to download (default "stable")
//   CLOUDPIN_SMOKE_CODE    path to an installed VS Code executable to use instead
// On Linux without a display, run it under `xvfb-run -a`.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { runTests } from "@vscode/test-electron";

const root = resolve(import.meta.dirname, "..");
const temp = mkdtempSync(join(tmpdir(), "cloudpin-smoke-"));

function writeFake(dir, status) {
  mkdirSync(dir, { recursive: true });
  const report = {
    result: status,
    path: ".cloudpin.yml",
    environment: null,
    providers: [{ provider: "azure", status, problems: status === "match" ? [] : ["the planted copy ran"] }],
  };
  writeFileSync(
    join(dir, "fake-cloudpin.cjs"),
    [
      "const args = process.argv.slice(2);",
      'if (args[0] === "--version") console.log("1.3.0");',
      `else if (args[0] === "check" && args[1] === "--json") console.log(${JSON.stringify(JSON.stringify(report))});`,
      "else process.exitCode = 2;",
    ].join("\n"),
  );
  if (process.platform === "win32") {
    writeFileSync(join(dir, "cloudpin.cmd"), `@"${process.execPath}" "%~dp0fake-cloudpin.cjs" %*\r\n`);
  } else {
    const sh = join(dir, "cloudpin");
    writeFileSync(sh, `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/fake-cloudpin.cjs" "$@"\n`);
    chmodSync(sh, 0o755);
  }
}

let code = 0;
try {
  const bin = join(temp, "bin");
  const workspace = join(temp, "workspace");
  const planted = join(workspace, "tools");
  writeFake(bin, "match");
  writeFake(planted, "mismatch");
  // Placeholder pin: the fake cloudpin never reads it, VS Code needs it to activate the extension.
  writeFileSync(join(workspace, ".cloudpin.yml"), "github:\n  user: example\n");

  // Reuse the spelling Windows gives the variable (often "Path"), so the child gets one PATH, not two.
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  await runTests({
    version: process.env.CLOUDPIN_SMOKE_VSCODE ?? "stable",
    ...(process.env.CLOUDPIN_SMOKE_CODE ? { vscodeExecutablePath: process.env.CLOUDPIN_SMOKE_CODE } : {}),
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, "test", "smoke", "index.cjs"),
    launchArgs: [
      workspace,
      "--disable-extensions",
      "--disable-workspace-trust",
      "--user-data-dir",
      join(temp, "user-data"),
      "--extensions-dir",
      join(temp, "extensions"),
    ],
    extensionTestsEnv: { [pathKey]: [planted, bin, process.env[pathKey] ?? ""].join(delimiter) },
  });
  console.log("smoke test passed");
} catch (err) {
  console.error("smoke test failed:", err instanceof Error ? err.message : err);
  code = 1;
} finally {
  rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
process.exit(code);
