import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 프론트에서 /api로 보내는 요청을 8787 포트(백엔드)로 배달해줍니다.
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      }
    }
  }
});