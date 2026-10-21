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

// On build, replace each page's stylesheet <link> with an inline <style>:
// the CSS is small, so this saves a render-blocking request. The CSS file is
// then dropped from the output, since no page links to it any more.
function inlineCss() {
  const sources = new Map();
  return {
    name: "inline-css",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, { bundle }) {
        return html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (tag) => {
          const file = tag.match(/\bhref="\/?([^"]+\.css)"/)?.[1];
          if (!file) return tag;
          if (!sources.has(file)) {
            const asset = bundle?.[file];
            if (asset?.type !== "asset") return tag;
            sources.set(file, String(asset.source));
            delete bundle[file];
          }
          return `<style>${sources.get(file)}</style>`;
        });
      },
    },
  };
}

export default defineConfig({
  plugins: [cloudflare(), inlineCss()],
  // The pages are the browser build's inputs only; the Worker build has its own.
  environments: {
    client: { build: { rollupOptions: { input: pages } } },
  },
  build: {
    // Keep images as separate files: inlining puts every srcset size in the HTML.
    assetsInlineLimit: 0,
    // The only script is preload.js, with no imports: skip the polyfill that
    // Vite would otherwise add to it.
    modulePreload: { polyfill: false },
  },
});