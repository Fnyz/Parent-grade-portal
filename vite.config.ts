import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// One build for both halves: the React pages become static assets and
// src/index.ts becomes the Worker that serves them and the API.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./web", import.meta.url)) },
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          // Separate pages, so parents never download the teacher dashboard.
          input: {
            parent: fileURLToPath(new URL("./index.html", import.meta.url)),
            teacher: fileURLToPath(new URL("./teacher.html", import.meta.url)),
            privacy: fileURLToPath(new URL("./privacy.html", import.meta.url)),
          },
        },
      },
    },
  },
});
