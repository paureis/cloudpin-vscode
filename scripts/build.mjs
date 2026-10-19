// Bundles the extension and cross-spawn into one CommonJS file, as the VS Code
// docs recommend (code.visualstudio.com/api/working-with-extensions/bundling-extension).
import { build } from "esbuild";

await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  // VS Code 1.100's extension host runs Node.js 20.
  target: "node20",
  external: ["vscode"],
  outfile: "dist/extension.js",
  // Left readable so anyone can audit what the .vsix runs.
  minify: false,
  sourcemap: false,
  logLevel: "info",
});
