#!/usr/bin/env node
/**
 * Thin wrapper around electron-vite.
 *
 * VS Code's integrated terminal exports ELECTRON_RUN_AS_NODE=1 for its child
 * processes. Electron honours that and boots as plain Node, at which point
 * require('electron') returns the path to the binary instead of the API object
 * and the main process dies on the first app.* call. Stripping the variable here
 * means `npm run dev` behaves the same wherever it is launched from.
 */
import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn('electron-vite', process.argv.slice(2), {
  stdio: 'inherit',
  env,
  shell: true
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
