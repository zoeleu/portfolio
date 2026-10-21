import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

// Every index.html outside node_modules/dist and hidden folders (such as
// .cloudflare build output) is a page, so new posts only need a folder:
// blog/<slug>/index.html.
const pages = readdirSync(".", { recursive: true })
  .filter((f) => f.endsWith("index.html") && !/^(node_modules|dist|\.[^/]+)\//.test(f))
  .map((f) => resolve(f));

export default defineConfig({
  plugins: [cloudflare()],
  build: { rollupOptions: { input: pages } },
});