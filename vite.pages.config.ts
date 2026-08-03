import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(projectRoot, "github-pages"),
  publicDir: resolve(projectRoot, "public"),
  // Relative build URLs work for user sites, project sites, forks, and custom
  // domains without knowing the eventual repository name in advance.
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(projectRoot, "dist-pages"),
    emptyOutDir: true,
    target: "es2022",
  },
});
