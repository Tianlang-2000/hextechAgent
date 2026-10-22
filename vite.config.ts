import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [vue(), electron({
    main: { entry: 'electron/main.ts', vite: { build: { rollupOptions: { external: ['chokidar'] } } } },
    preload: { input: 'electron/preload.ts' },
  })],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
