import { win32 } from "node:path";

/** What the switch terminal runs: the cloudpin subcommand and the resolved cloudpin file. */
export interface TerminalAction {
  command: "cloudpin switch" | "cloudpin check";
  /** The absolute path findCloudpin returned. */
  path: string;
}

/** Whether `shell` (vscode.env.shell, the default terminal shell) is cmd.exe. */
export function isCmdShell(shell: string): boolean {
  // win32.basename splits on both slashes.
  const name = win32.basename(shell).toLowerCase();
  return name === "cmd.exe" || name === "cmd";
}

/**
 * The text sent to the switch terminal. cmd.exe looks a bare name up in the
 * current folder (the workspace) before PATH and has no cloudpin shell function,
 * so it gets the resolved absolute path in double quotes (a Windows path cannot
 * contain `"`). Every other shell gets `cloudpin ...` by name: bash, zsh and
 * PowerShell need cloudpin's shell-init function for AWS_PROFILE, and none of
 * them searches the current folder for a bare name.
 */
export function terminalCommand({ command, path }: TerminalAction, shell: string): string {
  if (!isCmdShell(shell)) return command;
  return `"${path}" ${command.slice("cloudpin ".length)}`;
}
