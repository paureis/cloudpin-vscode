import { describe, expect, it } from "vitest";
import { type CheckReport, parseCheckReport } from "../src/report";
import {
  failedView,
  INSTALL_URL,
  missingView,
  outdatedView,
  restrictedView,
  unpinnedView,
  viewFromReport,
} from "../src/state";

const report = (over: Partial<CheckReport>): CheckReport => ({
  result: "match",
  path: "/work/app/.cloudpin.yml",
  environment: null,
  providers: [],
  ...over,
});

describe("parseCheckReport", () => {
  const good = {
    result: "mismatch",
    path: "/work/app/.cloudpin.yml",
    environment: { name: "prod", protected: true, source: "CLOUDPIN_ENV" },
    providers: [
      { provider: "azure", status: "mismatch", problems: ["subscription is Dev, pinned Prod"], fix: "az account set --subscription Prod" },
      { provider: "aws", status: "not-installed", problems: ["aws is not installed here"] },
    ],
    futureField: 1,
  };

  it("reads the JSON cloudpin check prints and drops unknown fields", () => {
    const parsed = parseCheckReport(JSON.stringify(good, null, 2));
    expect(parsed).toEqual({
      ok: true,
      report: {
        result: "mismatch",
        path: "/work/app/.cloudpin.yml",
        environment: { name: "prod", protected: true, source: "CLOUDPIN_ENV" },
        providers: good.providers,
      },
    });
  });

  it("reads an invalid-config report", () => {
    const parsed = parseCheckReport(
      JSON.stringify({ result: "error", path: null, environment: null, error: "invalid config: bad yaml", providers: [] }),
    );
    expect(parsed.ok && parsed.report.error).toBe("invalid config: bad yaml");
  });

  const malformed: [string, string][] = [
    ["not JSON", "did not print JSON"],
    ["", "did not print JSON"],
    ["[]", "unexpected value"],
    ["null", "unexpected value"],
    [JSON.stringify({ ...good, result: "maybe" }), "unexpected result"],
    [JSON.stringify({ ...good, path: 3 }), "unexpected path"],
    [JSON.stringify({ ...good, path: undefined }), "unexpected path"],
    [JSON.stringify({ ...good, environment: "prod" }), "unexpected environment"],
    [JSON.stringify({ ...good, environment: { name: "prod", protected: "yes", source: "x" } }), "unexpected environment"],
    [JSON.stringify({ ...good, error: { message: "x" } }), "unexpected error"],
    [JSON.stringify({ ...good, only: "azure" }), "unexpected only list"],
    [JSON.stringify({ ...good, providers: {} }), "unexpected provider list"],
    [JSON.stringify({ ...good, providers: [{ provider: "azure", status: "great", problems: [] }] }), "unexpected provider entry"],
    [JSON.stringify({ ...good, providers: [{ provider: "azure", status: "match", problems: [1] }] }), "unexpected provider entry"],
    [JSON.stringify({ ...good, providers: [{ provider: "azure", status: "match" }] }), "unexpected provider entry"],
    [JSON.stringify({ ...good, providers: [{ provider: "azure", status: "match", problems: [], fix: 2 }] }), "unexpected provider entry"],
    [JSON.stringify({ ...good, providers: ["azure"] }), "unexpected provider entry"],
  ];

  it("rejects anything that is not exactly the expected shape", () => {
    for (const [input, reason] of malformed) {
      const parsed = parseCheckReport(input);
      expect(parsed.ok, input).toBe(false);
      if (!parsed.ok) expect(parsed.reason, input).toContain(reason);
    }
  });

  it("malformed JSON becomes the grey failed state", () => {
    const parsed = parseCheckReport("{ oops");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      const view = failedView(parsed.reason);
      expect(view.kind).toBe("failed");
      expect(view.text).toBe("$(circle-slash) cloudpin");
      expect(view.color).toBe("disabledForeground");
      expect(view.background).toBeUndefined();
    }
  });
});

describe("viewFromReport", () => {
  it("match: green pinned icon, with the environment name when there is one", () => {
    const plain = viewFromReport(
      report({ providers: [{ provider: "azure", status: "match", problems: [] }, { provider: "aws", status: "not-installed", problems: ["aws is not installed here"] }] }),
      true,
    );
    expect(plain).toMatchObject({ kind: "match", text: "$(pinned) cloudpin", color: "testing.iconPassed", click: "switch" });
    expect(plain.background).toBeUndefined();
    expect(plain.hover).toContain("**azure**: matches");
    expect(plain.hover).toContain("**aws**: not installed here, nothing to check");
    expect(plain.label).toBe("cloudpin: every pinned account matches");

    const env = viewFromReport(report({ environment: { name: "staging", protected: false, source: "branch main" } }), true);
    expect(env.text).toBe("$(pinned) staging");
    expect(env.label).toContain("environment staging");
    expect(env.hover).toContain("Environment: staging, chosen by branch main");
  });

  it("match: an environment name outside cloudpin's rules is not put in the item text", () => {
    const view = viewFromReport(report({ environment: { name: "$(alert) x", protected: true, source: "x" } }), true);
    expect(view.text).toBe("$(pinned) cloudpin");
    expect(view.hover).toContain("(protected)");
  });

  it("match with nothing pinned says so", () => {
    expect(viewFromReport(report({}), true).hover).toContain("No cloud is pinned in this file.");
  });

  for (const status of ["mismatch", "not-logged-in", "unknown"] as const) {
    it(`any ${status} cloud: red pinned-dirty item with problems and fix`, () => {
      const view = viewFromReport(
        report({
          result: status === "unknown" ? "error" : "mismatch",
          providers: [
            { provider: "azure", status: "match", problems: [] },
            { provider: "gcloud", status, problems: ["the problem text"], fix: "the fix text" },
          ],
        }),
        true,
      );
      expect(view).toMatchObject({ kind: "mismatch", text: "$(pinned-dirty) cloudpin", background: "statusBarItem.errorBackground" });
      expect(view.color).toBeUndefined();
      expect(view.hover).toContain("the problem text");
      expect(view.hover).toContain("the fix text");
      expect(view.label).toBe("cloudpin: one cloud is not on the pinned account");
    });
  }

  it("counts several clouds in the label", () => {
    const view = viewFromReport(
      report({
        result: "mismatch",
        providers: [
          { provider: "azure", status: "mismatch", problems: ["a"] },
          { provider: "aws", status: "not-logged-in", problems: ["not logged in"] },
        ],
      }),
      true,
    );
    expect(view.label).toBe("cloudpin: 2 clouds are not on the pinned account");
  });

  it("error (invalid pin file): warning item with the error text", () => {
    const view = viewFromReport(report({ result: "error", path: null, error: "invalid config: line 3: bad indent" }), true);
    expect(view).toMatchObject({ kind: "error", text: "$(warning) cloudpin", background: "statusBarItem.warningBackground" });
    expect(view.hover).toContain("invalid config\\: line 3\\: bad indent");
  });

  it("an unsupported pinned cloud: warning item that points at the upgrade", () => {
    const view = viewFromReport(
      report({ result: "error", providers: [{ provider: "newcloud", status: "unsupported", problems: ["pinned, but not supported"] }] }),
      true,
    );
    expect(view).toMatchObject({ kind: "error", text: "$(warning) cloudpin", click: "install" });
    expect(view.hover).toContain(INSTALL_URL);
  });

  it("a mismatch outweighs an unsupported cloud", () => {
    const view = viewFromReport(
      report({
        result: "error",
        providers: [
          { provider: "azure", status: "mismatch", problems: ["x"] },
          { provider: "newcloud", status: "unsupported", problems: ["y"] },
        ],
      }),
      true,
    );
    expect(view.kind).toBe("mismatch");
  });

  it("unpinned: grey pin", () => {
    const view = viewFromReport(report({ result: "unpinned", path: null }), true);
    expect(view).toEqual(unpinnedView());
    expect(view).toMatchObject({ text: "$(pin) cloudpin", color: "disabledForeground" });
    expect(view.hover).toContain("no .cloudpin.yml in this folder");
  });

  it("a result with no cloud to blame becomes the failed state", () => {
    expect(viewFromReport(report({ result: "error" }), true).kind).toBe("failed");
    expect(viewFromReport(report({ result: "mismatch" }), true).kind).toBe("failed");
  });

  it("the click line names switch or, before cloudpin 1.3.0, check", () => {
    const r = report({ providers: [{ provider: "azure", status: "match", problems: [] }] });
    expect(viewFromReport(r, true).hover).toContain("`cloudpin switch` in a terminal");
    expect(viewFromReport(r, false).hover).toContain("`cloudpin check` in a terminal");
  });

  it("escapes cloudpin's problem and fix text, the path and the environment", () => {
    const view = viewFromReport(
      report({
        result: "mismatch",
        path: "/x/[p](command:evil)/.cloudpin.yml",
        environment: { name: "prod", protected: false, source: "<img src=x>" },
        providers: [{ provider: "azure", status: "mismatch", problems: ["[x](command:foo)"], fix: "<img src=x onerror=alert(1)>" }],
      }),
      true,
    );
    expect(view.hover).not.toContain("[x](command:foo)");
    expect(view.hover).toContain("\\[x\\]\\(command\\:foo\\)");
    expect(view.hover).not.toMatch(/(^|[^\\])<img/);
    expect(view.hover).toContain("\\<img src\\=x onerror\\=alert\\(1\\)\\>");
    expect(view.hover).not.toContain("[p](command:evil)");
  });
});

describe("the other states", () => {
  it("cloudpin not found: grey, click opens the install page", () => {
    expect(missingView()).toMatchObject({ kind: "missing", text: "$(circle-slash) cloudpin", color: "disabledForeground", click: "install" });
    expect(missingView().hover).toContain(INSTALL_URL);
  });

  it("cloudpin too old: grey, says the version and the minimum", () => {
    const view = outdatedView("1.1.1");
    expect(view).toMatchObject({ kind: "outdated", text: "$(circle-slash) cloudpin", click: "install" });
    expect(view.hover).toContain("1\\.1\\.1");
    expect(view.hover).toContain("1.2.0");
  });

  it("failed to run: grey, with the reason escaped", () => {
    const view = failedView("spawn failed: <b>x</b>");
    expect(view).toMatchObject({ kind: "failed", text: "$(circle-slash) cloudpin", color: "disabledForeground" });
    expect(view.hover).toContain("\\<b\\>x\\<\\/b\\>");
  });

  it("Restricted Mode: grey shield, click manages trust", () => {
    expect(restrictedView()).toMatchObject({ kind: "restricted", text: "$(shield) cloudpin", color: "disabledForeground", click: "trust" });
    expect(restrictedView().hover).toContain("trust this folder to check its accounts");
  });

  it("every state has a name for screen readers", () => {
    for (const view of [missingView(), outdatedView("1.0.0"), failedView("x"), restrictedView(), unpinnedView()]) {
      expect(view.label).toMatch(/^cloudpin: /);
    }
  });
});
