import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), "");
  let target = "http://127.0.0.1:5000";
  try {
    const configured = new URL(values.VITE_API_URL || target);
    if (["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname)) {
      if (configured.hostname === "localhost") configured.hostname = "127.0.0.1";
      target = configured.origin;
    }
  } catch { /* A relative /api/v1 uses the standard local API target. */ }
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          cookieDomainRewrite: "",
          timeout: 0,
          proxyTimeout: 0,
        },
      },
    },
  };
});
