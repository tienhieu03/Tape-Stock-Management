import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'socket.io-client': path.resolve(__dirname, 'src/services/mockSocket.js')
    }
  },
  server: {
    host: true,
    port: 3000
  }
});
