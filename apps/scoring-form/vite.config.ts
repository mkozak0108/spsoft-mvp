import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'

const bridgeContract = fileURLToPath(
  new URL('../viewer/extensions/bridge/src/messages.ts', import.meta.url),
)
const bridgeBuilders = fileURLToPath(
  new URL('../viewer/extensions/bridge/src/buildMessages.ts', import.meta.url),
)
const bridgeUtils = fileURLToPath(new URL('../viewer/extensions/bridge/src/utils', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@bridge-contract': bridgeContract,
      '@bridge-builders': bridgeBuilders,
      '@bridge-utils': bridgeUtils,
    },
  },
  server: {
    // The contract, its builders and its guards live in the viewer submodule, outside the
    // directories the dev server serves by default.
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), bridgeContract, bridgeBuilders, bridgeUtils],
    },
  },
  test: {
    environment: 'jsdom',
  },
})
