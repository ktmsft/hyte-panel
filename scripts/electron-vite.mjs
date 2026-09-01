#!/usr/bin/env node
/**
 * VS Code terminals export ELECTRON_RUN_AS_NODE=1, which makes Electron boot as
 * plain Node and require('electron') return a path string. Strip it.
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
