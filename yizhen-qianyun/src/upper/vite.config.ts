import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { artworkRecognitionApi } from "./artworkRecognitionApi";
import { localAuthApi } from "./localAuthApi";
import { modelImageApi } from "./modelImageApi";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [localAuthApi(), react(), artworkRecognitionApi(), modelImageApi(env)],
    server: { host: "127.0.0.1", port: 4173, strictPort: true, fs: { deny: [".env", ".env.*", "**/.git/**", "**/.local-admin*", "**/*.pem", "**/*.key"] } },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  };
});
