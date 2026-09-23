import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiProxyTarget = env.DEV_API_TARGET || "http://localhost:8000";

  return {
    plugins: [
      react(),
      {
        name: "log-proxy-target",
        configureServer(server) {
          if (!env.DEV_API_TARGET) return;
          server.httpServer?.once("listening", () => {
            server.config.logger.warn(`  ➜  API 프록시:  ${apiProxyTarget}`);
          });
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    // 운영 nginx와 같은 모양으로 맞춘다. 개발도 same-origin이 되어 CORS가 필요 없다.
    // ws는 내보내기 진행률(/api/export/ws/{id})이 WebSocket이라 필요하다.
    // 로컬 백엔드가 아닌 곳에 붙일 때는 .env.local의 DEV_API_TARGET으로 덮는다.
    server: {
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      environment: "node",
    },
  };
});
