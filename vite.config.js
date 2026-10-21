import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Every index.html outside node_modules/dist is a page, so new posts
// only need a folder: blog/<slug>/index.html.
const pages = readdirSync(".", { recursive: true })
  .filter((f) => f.endsWith("index.html") && !/^(node_modules|dist)\//.test(f))
  .map((f) => resolve(f));

export default defineConfig({
  build: { rollupOptions: { input: pages } },
});
