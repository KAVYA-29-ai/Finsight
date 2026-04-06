import { defineConfig } from 'vite';

export default defineConfig({
  envPrefix: ['VITE_', 'PHONEPE_', 'FINSIGHT_'],
  server: {
    proxy: {
      '/api/': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
}); 