import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Build-stamp: short commit + build date, shown under the "Cue" wordmark so you
// can tell which revision is running (including a cached/offline copy). Prefer
// Vercel's commit env var, fall back to local git, then to 'dev'.
function gitRev() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
    || (() => { try { return execSync('git rev-parse HEAD').toString().trim() } catch { return '' } })()
  return sha ? sha.slice(0, 7) : 'dev'
}
const APP_REV = gitRev()
const BUILD_DATE = new Date().toISOString().slice(0, 10)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_REV': JSON.stringify(APP_REV),
    'import.meta.env.VITE_BUILD_DATE': JSON.stringify(BUILD_DATE),
  },
})
