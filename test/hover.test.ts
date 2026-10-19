import { describe, expect, it } from "vitest";
import { escapeMarkdown } from "../src/hover";

/** True when every ASCII punctuation character is backslash-escaped, so Markdown and HTML can't act on it. */
function inert(markdown: string): boolean {
  return !/[!-/:-@[-`{-~]/.test(markdown.replace(/\\[!-/:-@[-`{-~]/g, ""));
}

describe("escapeMarkdown", () => {
  const hostile = [
    "[x](command:foo)",
    "[click](command:workbench.action.terminal.sendSequence?%7B%22text%22%3A%22rm%22%7D)",
    '<img src=x onerror="alert(1)">',
    "<a href='https://example.com'>here</a>",
    "**bold** _it_ `code` ~~strike~~",
    "# heading\n- item\n> quote\n1. one",
    "![image](https://example.com/x.png)",
    "&lt;script&gt; &#60;",
    "$(alert) icon syntax",
    "https://example.com/autolink and www.example.com",
    "back\\slash \\[",
    "| table | row |",
  ];

  it("leaves no active Markdown or HTML in hostile text", () => {
    for (const input of hostile) expect(inert(escapeMarkdown(input)), input).toBe(true);
  });

  it("the check above fails on unescaped text (control)", () => {
    for (const input of hostile) expect(inert(input), input).toBe(false);
  });

  it("keeps the text readable and on one line", () => {
    expect(escapeMarkdown("az account set --subscription 1234")).toBe("az account set \\-\\-subscription 1234");
    expect(escapeMarkdown("one\ntwo\r\n  three\t")).toBe("one two three");
  });

  it("shortens very long text", () => {
    const out = escapeMarkdown("a".repeat(1000));
    expect(out.length).toBeLessThan(410);
    expect(out.endsWith("…")).toBe(true);
  });
});
