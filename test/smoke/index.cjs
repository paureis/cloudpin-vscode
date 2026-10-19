// Runs inside the VS Code extension host started by scripts/smoke.mjs.
const assert = require("node:assert");
const vscode = require("vscode");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(what, read, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let value = read();
  while (!value && Date.now() < deadline) {
    await sleep(200);
    value = read();
  }
  return value;
}

exports.run = async function run() {
  const ext = vscode.extensions.getExtension("paureis.cloudpin");
  assert.ok(ext, "the extension paureis.cloudpin is not loaded");

  // workspaceContains:**/.cloudpin.yml should activate it without help.
  const active = await waitFor("activation", () => ext.isActive, 20_000);
  assert.ok(active, "the extension did not activate in a folder with a .cloudpin.yml");

  const api = await ext.activate();
  const state = await waitFor("first check", () => api.state(), 30_000);
  assert.strictEqual(state, "match", `the item shows "${state}", expected "match" from the cloudpin outside the workspace`);

  const commands = await vscode.commands.getCommands(true);
  for (const id of ["cloudpin.refresh", "cloudpin.switch"]) assert.ok(commands.includes(id), `${id} is not registered`);
};
