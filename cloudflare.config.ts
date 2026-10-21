import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./worker/index.js" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    "name": "portfolio",
    "compatibilityDate": "2026-10-19",
    "domains": ["zoe.dev.br", "www.zoe.dev.br"],
    // Handles POST /api/contact; every other request is a static file.
    entrypoint,
    "observability": {
      "enabled": true
    },
    "assets": {
      // Multi-page static site: unknown paths get a real 404, not the home page.
      "htmlHandling": "auto-trailing-slash",
      "notFoundHandling": "none"
    },
    env: {
      ASSETS: bindings.assets(),
      // Set with `npx wrangler secret put <NAME> --name portfolio`; never committed.
      TURNSTILE_SECRET: bindings.secret(),
      GMAIL_USER: bindings.secret(),
      GMAIL_APP_PASSWORD: bindings.secret(),
    },
  }
});
