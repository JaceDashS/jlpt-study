import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { getDevServerConfig, mobileAccessPlugin } from "./dev-mobile-access.js";

function readApiPort() {
  const rawPort = process.env.JLPT_API_PORT ?? "3001";
  const port = Number(rawPort);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3001;
}

export default defineConfig({
  plugins: [mobileAccessPlugin(), react()],
  server: {
    ...getDevServerConfig(),
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${readApiPort()}`,
        changeOrigin: true,
      },
    },
  },
});
