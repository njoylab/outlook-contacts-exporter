import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

type PrerenderOptions = Parameters<typeof import('vite-plugin-prerender').default>[0]

const require = createRequire(import.meta.url)
const prerender = require('vite-plugin-prerender') as (options: PrerenderOptions) => Plugin
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    prerender({
      staticDir: path.resolve(__dirname, 'dist'),
      routes: ['/', '/privacy', '/legacy-outlook'],
    }),
  ],
})
