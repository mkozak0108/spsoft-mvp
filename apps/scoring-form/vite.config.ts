import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'

const bridgeContract = fileURLToPath(
  new URL('../viewer/extensions/bridge/src/messages.ts', import.meta.url),
)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@bridge-contract': bridgeContract },
  },
  server: {
    // The contract lives in the viewer submodule, outside the directories the dev server
    // serves by default.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), bridgeContract] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
