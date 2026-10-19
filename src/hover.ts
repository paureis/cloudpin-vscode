/** Longest piece of outside text a hover shows, in characters, before escaping. */
export const MAX_TEXT = 400;

/**
 * Text from outside the extension (cloudpin's problems and fixes, a path, an
 * error message) as inert Markdown: whitespace collapsed to single spaces (so it
 * can't start a heading, list or quote line), shortened, and every ASCII
 * punctuation character backslash-escaped, which CommonMark allows for all of
 * them. Links, images, HTML tags, entities, emphasis and autolinks then render as
 * plain text. The hover is also an untrusted MarkdownString without HTML or
 * theme icons, so even a missed character could not run a command.
 */
export function escapeMarkdown(text: string): string {
  let flat = text.replace(/\s+/g, " ").trim();
  if (flat.length > MAX_TEXT) flat = flat.slice(0, MAX_TEXT - 1) + "…";
  return flat.replace(/[!-/:-@[-`{-~]/g, "\\$&");
}
