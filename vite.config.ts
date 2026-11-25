import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    cloudflare(),
    tanstackStart({
      server: { entry: "server" },
      client: { entry: "client" },
    }),
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
