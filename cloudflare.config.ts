import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./worker/index.js" with { type: "cf-worker" };

export default defineConfig(({ mode }) => ({
  worker: {
    "name": "portfolio",
    "compatibilityDate": "2026-10-19",
    "domains": ["zoe.dev.br", "www.zoe.dev.br"],
    // Handles /api/contact and /api/agents/*; every other request is a static file.
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
      // Solved proof-of-work challenges, so each one sends a single message.
      POW_USED: bindings.kv({ id: "a5bb6273d407440b8a0a3c9b67b78d12" }),
      // In production the secrets TURNSTILE_SECRET, GMAIL_USER and
      // GMAIL_APP_PASSWORD are set in the dashboard (Worker > Settings >
      // Variables and Secrets), not declared here: a declared secret must exist
      // before a deploy, and the dashboard only takes secrets once the Worker
      // has code. The Worker answers "not configured" until they are set.
      // Locally, only declared secrets get values from .env, so declare the
      // Turnstile one in development. Gmail is never contacted from localhost.
      ...(mode === "development" ? { TURNSTILE_SECRET: bindings.secret() } : {}),
    },
  },
}));
