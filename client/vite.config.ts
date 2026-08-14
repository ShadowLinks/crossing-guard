import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the Compliance Rule Manager frontend.
// In dev mode, API calls (/api/*, /auth/*) are proxied to the Express
// server so the browser can talk to both on http://localhost:5173 without
// CORS headaches. In production the built client is served directly by
// the Express server, so no proxy is needed there.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/auth": "http://localhost:3000"
    }
  },
  build: {
    outDir: "dist"
  }
});
