import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createPublicBinsHandler } from './server/public-bins-handler.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'civil-bin-public-data',
      configureServer(server) {
        const handler = createPublicBinsHandler()
        server.middlewares.use('/api/public-bins', handler)
      },
    },
  ],
  base: './',
})
