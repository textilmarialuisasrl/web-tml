import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig(({ mode }) => ({
  root: path.resolve(__dirname, "src/app"),
  publicDir: path.resolve(__dirname, "public"),
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: ".",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: null,
      manifest: {
        name: "Textil María Luisa ERP",
        short_name: "TML ERP",
        description: "Sistema PWA Industrial ERP de Textil María Luisa SRL",
        theme_color: "#111827",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/app/",
        scope: "/app/",
        icons: [
          {
            src: "/images/logo.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/images/logo.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/app")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "public/app"),
    emptyOutDir: true,
    sourcemap: mode === "development",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) {
              return "vendor-react";
            }
            if (id.includes("dexie")) {
              return "vendor-dexie";
            }
            if (id.includes("zustand")) {
              return "vendor-zustand";
            }
            return "vendor";
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    }
  }
}));
