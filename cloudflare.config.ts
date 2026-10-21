import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    "name": "portfolio",
    "compatibilityDate": "2026-10-19",
    "observability": {
      "enabled": true
    },
    "assets": {
      // Multi-page static site: unknown paths get a real 404, not the home page.
      "htmlHandling": "auto-trailing-slash",
      "notFoundHandling": "none"
    }
  }
});
