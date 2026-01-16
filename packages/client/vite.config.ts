import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  build: {
    rollupOptions: {
      output: {
        // perform manual chunks to these dependencies to reduce build size
        manualChunks: {
          react: ["react", "react-dom"],
          pixi: ["pixi.js", "@pixi/react"],
          colyseus: ["colyseus.js"],
          discord: ["@discord/embedded-app-sdk"],
        },
      },
    },
    // sourcemap: true,
  },

  // https://github.com/colyseus/discord-activity/blob/main/apps/client/vite.config.js
  server: {
    allowedHosts: ["localhost", ".trycloudflare.com", ".ngrok-free.app"],
    proxy: {
      "/colyseus": {
        target: "http://localhost:2567",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ""),
      },
    },
  },
});
