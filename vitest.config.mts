import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The extension host provides "vscode" at run time; unit tests get a small fake.
    alias: { vscode: fileURLToPath(new URL("./test/fake-vscode.ts", import.meta.url)) },
  },
  test: {
    // The Electron smoke test (test/smoke) runs only through `npm run test:smoke`.
    include: ["test/*.test.ts"],
  },
});
