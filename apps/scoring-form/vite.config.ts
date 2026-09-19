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

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@bridge-contract': bridgeContract, '@bridge-builders': bridgeBuilders },
  },
  server: {
    // The contract and its builders live in the viewer submodule, outside the directories the
    // dev server serves by default.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), bridgeContract, bridgeBuilders] },
  },
  test: {
    environment: 'jsdom',
  },
})
