import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages 配信時はリポジトリ名に合わせて base を変更する（例: "/gikai-search/"）。
// 環境変数 GIKAI_BASE があればそれを優先。ローカル開発は "/"。
const base = process.env.GIKAI_BASE || "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: "dist",
    target: "es2020",
  },
});
