import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "./",
  plugins: [vue()],
  server: { port: 9000, host: "127.0.0.1", open: false },
  preview: { port: 9018, host: "127.0.0.1", strictPort: true },
  build: { outDir: "dist", assetsDir: "assets" },
});
