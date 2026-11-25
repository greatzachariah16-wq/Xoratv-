import { defineConfig } from "cf/config";
import * as entrypoint from "@tanstack/react-start/server-entry" with {
  type: "cf-worker",
};

export default defineConfig({
  worker: {
    name: "xoratv-app",
    entrypoint,
    compatibilityDate: "2026-11-25",
  },
});
