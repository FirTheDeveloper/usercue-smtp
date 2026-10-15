import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const STUB_ID = "\0usercue-server-stub";

function stubServerPackage(): Plugin {
  return {
    name: "stub-usercue-server",
    enforce: "pre",
    resolveId(id) {
      if (id === "@usercue/server") return STUB_ID;
    },
    load(id) {
      if (id === STUB_ID) return "export {}";
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const publicHost = env.PUBLIC_URL ? new URL(env.PUBLIC_URL).hostname : undefined;
  const apiTarget = env.API_URL ?? "http://localhost:3000";

  const proxy = { target: apiTarget, xfwd: true };

  return {
    plugins: [stubServerPackage(), react(), tailwindcss()],
    clearScreen: false,
    server: {
      host: true,
      allowedHosts: publicHost ? [publicHost] : [],
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": proxy,
        "/uploads": proxy,
      },
    },
    build: { target: "es2022" },
  };
});
