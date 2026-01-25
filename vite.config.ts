import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const useHttps = process.env.VITE_DEV_HTTPS === "true";
const https =
  useHttps &&
  existsSync(resolve(__dirname, "certs/dev-key.pem")) &&
  existsSync(resolve(__dirname, "certs/dev-cert.pem"))
    ? {
        key: readFileSync(resolve(__dirname, "certs/dev-key.pem")),
        cert: readFileSync(resolve(__dirname, "certs/dev-cert.pem"))
      }
    : undefined;

export default defineConfig({
  base: "/map-webapp/",
  build: {
    outDir: "docs"
  },
  server: https ? { https } : undefined,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "PWA Location Game",
        short_name: "GeoGame",
        description: "Minimal location-based game PWA",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/map-webapp/",
        scope: "/map-webapp/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ]
});
