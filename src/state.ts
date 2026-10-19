import { escapeMarkdown as esc } from "./hover";
import type { CheckEntry, CheckReport } from "./report";
import { CHECK_VERSION, formatVersion } from "./version";

/** cloudpin's install and upgrade instructions. */
export const INSTALL_URL = "https://github.com/paureis/cloudpin#install";

export type Kind = "match" | "mismatch" | "error" | "unpinned" | "missing" | "outdated" | "failed" | "restricted";

/** What clicking the item does: the switch terminal, the install page, or the workspace trust editor. */
export type Click = "switch" | "install" | "trust";

/** Everything the status bar item shows, with no `vscode` types so it can be unit-tested. */
export interface View {
  kind: Kind;
  /** Item text, with `$(icon)` syntax. */
  text: string;
  /** Theme colour id for the text (only the error and warning backgrounds exist for items). */
  color?: string;
  /** Theme colour id for the background. */
  background?: string;
  /** What a screen reader says. */
  label: string;
  /** Hover, as Markdown. Every piece of outside text in it is escaped. */
  hover: string;
  click: Click;
}

const GREEN = "testing.iconPassed";
const GREY = "disabledForeground";
const RED_BG = "statusBarItem.errorBackground";
const YELLOW_BG = "statusBarItem.warningBackground";
const MIN = formatVersion(CHECK_VERSION);
const INSTALL_LINK = `[cloudpin's install instructions](${INSTALL_URL})`;

/** cloudpin's own rule for environment names; anything else is not put in the item's text. */
const ENV_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/;

const paragraphs = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join("\n\n");

function clickLine(canSwitch: boolean): string {
  return canSwitch
    ? "Click to run `cloudpin switch` in a terminal."
    : "Click to run `cloudpin check` in a terminal (`cloudpin switch` needs cloudpin 1.3.0).";
}

function context(report: CheckReport): string | undefined {
  const lines: string[] = [];
  if (report.environment) {
    const { name, protected: isProtected, source } = report.environment;
    lines.push(`Environment: ${esc(name)}${isProtected ? " (protected)" : ""}, chosen by ${esc(source)}`);
  }
  if (report.path !== null) lines.push(`Pin file: ${esc(report.path)}`);
  // Two trailing spaces: a Markdown line break inside one paragraph.
  return lines.length > 0 ? lines.join("  \n") : undefined;
}

const joined = (problems: string[]) => problems.map(esc).join("; ");

function entryLine({ provider, status, problems, fix }: CheckEntry): string {
  const name = `**${esc(provider)}**`;
  let line: string;
  switch (status) {
    case "match":
      line = `${name}: matches`;
      break;
    case "not-installed":
      line = `${name}: not installed here, nothing to check`;
      break;
    case "unsupported":
      line = `${name}: ${problems.length > 0 ? joined(problems) : "not supported by this version of cloudpin"}`;
      break;
    case "unknown":
      line = `${name}: could not tell which account is active${problems.length > 0 ? `: ${joined(problems)}` : ""}`;
      if (fix !== undefined) return `- ${line}\n  - to see what is wrong: ${esc(fix)}`;
      break;
    default:
      line = `${name}: ${problems.length > 0 ? joined(problems) : status}`;
  }
  return fix !== undefined ? `- ${line}\n  - fix: ${esc(fix)}` : `- ${line}`;
}

const entryList = (report: CheckReport) =>
  report.providers.length > 0 ? report.providers.map(entryLine).join("\n") : "No cloud is pinned in this file.";

/** The item for a `cloudpin check --json` report, following the design's table. */
export function viewFromReport(report: CheckReport, canSwitch: boolean): View {
  if (report.result === "unpinned") return unpinnedView();
  if (report.error !== undefined) {
    return {
      kind: "error",
      text: "$(warning) cloudpin",
      background: YELLOW_BG,
      label: "cloudpin: the pin file is invalid",
      hover: paragraphs("**cloudpin**: the pin file is invalid.", esc(report.error), context(report), clickLine(canSwitch)),
      click: "switch",
    };
  }
  const bad = report.providers.filter((p) => p.status === "mismatch" || p.status === "not-logged-in" || p.status === "unknown");
  if (bad.length > 0) {
    return {
      kind: "mismatch",
      text: "$(pinned-dirty) cloudpin",
      background: RED_BG,
      label: `cloudpin: ${bad.length === 1 ? "one cloud is" : `${bad.length} clouds are`} not on the pinned account`,
      hover: paragraphs("**cloudpin**: not every cloud is on the pinned account.", context(report), entryList(report), clickLine(canSwitch)),
      click: "switch",
    };
  }
  if (report.providers.some((p) => p.status === "unsupported")) {
    return {
      kind: "error",
      text: "$(warning) cloudpin",
      background: YELLOW_BG,
      label: "cloudpin: a pinned cloud can't be checked by this version of cloudpin",
      hover: paragraphs(
        "**cloudpin**: a pinned cloud can't be checked by this version of cloudpin.",
        context(report),
        entryList(report),
        `Upgrade cloudpin: ${INSTALL_LINK}.`,
      ),
      click: "install",
    };
  }
  if (report.result === "match") {
    const env = report.environment?.name;
    const shown = env !== undefined && ENV_NAME.test(env) ? env : undefined;
    return {
      kind: "match",
      text: `$(pinned) ${shown ?? "cloudpin"}`,
      color: GREEN,
      label: `cloudpin: every pinned account matches${shown !== undefined ? `, environment ${shown}` : ""}`,
      hover: paragraphs("**cloudpin**: every pinned account matches.", context(report), entryList(report), clickLine(canSwitch)),
      click: "switch",
    };
  }
  return failedView(`cloudpin check reported "${report.result}" without saying which cloud`);
}

export function unpinnedView(): View {
  return {
    kind: "unpinned",
    text: "$(pin) cloudpin",
    color: GREY,
    label: "cloudpin: no .cloudpin.yml in this folder",
    hover: paragraphs("**cloudpin**: no .cloudpin.yml in this folder or above it, so nothing is pinned here."),
    click: "switch",
  };
}

export function missingView(): View {
  return {
    kind: "missing",
    text: "$(circle-slash) cloudpin",
    color: GREY,
    label: "cloudpin: cloudpin is not installed or not on PATH",
    hover: paragraphs(
      "**cloudpin** was not found on the PATH that VS Code sees.",
      `Install cloudpin ${MIN} or later: ${INSTALL_LINK}. If it is installed, start VS Code from a terminal where \`cloudpin --version\` works. A cloudpin inside an open folder is never used.`,
      "Click to open the install instructions.",
    ),
    click: "install",
  };
}

export function outdatedView(version: string): View {
  return {
    kind: "outdated",
    text: "$(circle-slash) cloudpin",
    color: GREY,
    label: `cloudpin: cloudpin ${version} is older than ${MIN}`,
    hover: paragraphs(
      `**cloudpin** ${esc(version)} is older than ${MIN}, which this extension needs.`,
      `Upgrade it: ${INSTALL_LINK}.`,
      "Click to open the install instructions.",
    ),
    click: "install",
  };
}

export function failedView(reason: string): View {
  return {
    kind: "failed",
    text: "$(circle-slash) cloudpin",
    color: GREY,
    label: "cloudpin: the account check failed to run",
    hover: paragraphs(
      "**cloudpin** could not check the accounts.",
      `Reason: ${esc(reason)}`,
      `To reinstall or upgrade: ${INSTALL_LINK}.`,
      "Click to run cloudpin in a terminal and see its output.",
    ),
    click: "switch",
  };
}

export function restrictedView(): View {
  return {
    kind: "restricted",
    text: "$(shield) cloudpin",
    color: GREY,
    label: "cloudpin: Restricted Mode, trust this folder to check its accounts",
    hover: paragraphs(
      "**cloudpin**: trust this folder to check its accounts.",
      "In Restricted Mode the extension does not run cloudpin.",
      "Click to manage workspace trust.",
    ),
    click: "trust",
  };
}
