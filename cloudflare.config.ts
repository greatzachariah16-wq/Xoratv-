import { defineConfig } from "cf/config";
import * as entrypoint from "@tanstack/react-start/server-entry" with {
  type: "cf-worker",
};

export default defineConfig({
  workers: [
    {
      name: "xoratv-app",
      entrypoint,
      compatibilityDate: "2026-11-25",
      observability: { enabled: true },
    },
  ],
});
