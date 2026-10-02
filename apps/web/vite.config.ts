import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // The browser only talks to this dev server; /api/* is forwarded to the
    // API, so cookies stay first-party and no cross-origin requests happen.
    proxy: {
      "/api": {
        // The end-to-end tests point this at their own API server.
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
