import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function stubServerPackage(): Plugin {
  return {
    name: "stub-usercue-server",
    enforce: "pre",
    resolveId(id) {
      if (id === "@usercue/server") return "\0usercue-server-stub";
    },
    load(id) {
      if (id === "\0usercue-server-stub") return "export {}";
    },
  };
}

export default defineConfig({
  plugins: [stubServerPackage(), react(), tailwindcss()],
  clearScreen: false,
  optimizeDeps: {
    exclude: ["@usercue/server"],
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:3000",
        xfwd: true,
      },
      "/uploads": {
        target: process.env.API_URL ?? "http://localhost:3000",
        xfwd: true,
      },
    },
  },
  build: { target: "es2022" },
});
