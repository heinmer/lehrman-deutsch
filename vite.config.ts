import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  /**
   * Where the site will be served from. Everything the app requests is built
   * from this (see src/lib/assets.ts), so deploying under a prefix — a project
   * page, a preview URL, a proxy — is `BASE_PATH=/texts-in-german/ npm run
   * build` and nothing else.
   */
  base: process.env.BASE_PATH ?? "/",
  server: {
    port: 5173,
  },
});
