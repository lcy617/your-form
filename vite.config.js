import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// base: './' 让打包产物用相对路径，可部署到 GitHub Pages 的任意子路径
export default defineConfig({
  base: "./",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    // Three.js 较大，适当提高警告阈值
    chunkSizeWarningLimit: 1500,
  },
});
