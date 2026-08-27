import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { boundra } from 'boundra/vite'
import path from 'path'

const buildVersion = process.env.VERCEL_GIT_COMMIT_SHA
  ?? process.env.GITHUB_SHA
  ?? String(Date.now())

const appVersionPlugin = (version: string): Plugin => ({
  name: 'app-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version }),
    })
  },
})

const getBasePath = () => {
  if (process.env.GITHUB_ACTIONS !== 'true') return '/'

  const [owner, repository] = (process.env.GITHUB_REPOSITORY ?? '').split('/')
  if (!owner || !repository || repository.toLowerCase() === `${owner.toLowerCase()}.github.io`) return '/'

  return `/${repository}/`
}

// https://vite.dev/config/
export default defineConfig({
  base: getBasePath(),
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [boundra(), react(), appVersionPlugin(buildVersion)],
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
      '@application': path.resolve(__dirname, './src/application'),
      '@presentation': path.resolve(__dirname, './src/components'),
    },
  },
})
