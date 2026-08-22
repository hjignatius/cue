import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// App version shown under the "Cue" wordmark so you can tell which release is
// running (including a cached/offline copy). package.json is the single source
// of truth — bump it (or `npm version …`) to change the number, then tag it.
const APP_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
  },
})
