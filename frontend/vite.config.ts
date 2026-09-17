import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // 운영 nginx와 같은 모양으로 맞춘다. 개발도 same-origin이 되어 CORS가 필요 없다.
  // ws는 내보내기 진행률(/api/export/ws/{id})이 WebSocket이라 필요하다.
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    environment: "node",
  },
});
