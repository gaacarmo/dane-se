import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverUrl = process.env.SERVER_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // reachable from phones on the same Wi-Fi
    proxy: {
      '/socket.io': { target: serverUrl, ws: true },
      '/health': serverUrl,
    },
  },
});
