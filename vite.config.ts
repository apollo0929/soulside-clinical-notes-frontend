import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { srcPathAlias } from './resolve-aliases.ts'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      ...srcPathAlias,
    },
  },
})
