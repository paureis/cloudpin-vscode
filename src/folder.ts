/**
 * The workspace folder to check (design, "Multi-root"): the folder of the active
 * editor (or, while no editor is active, of the last one), else the first folder
 * with a `.cloudpin.yml`, else the first folder. cloudpin itself then looks for
 * the nearest pin file upward from it. Undefined only with no folder open.
 */
export function pickFolder(
  editorFolder: string | undefined,
  folders: readonly string[],
  hasPinFile: (folder: string) => boolean,
): string | undefined {
  if (editorFolder !== undefined && folders.includes(editorFolder)) return editorFolder;
  return folders.find(hasPinFile) ?? folders[0];
}
