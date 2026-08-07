import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.NODE_OPTIONS

const executable = process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
const child = spawn(executable, ['dev', '--watch'], {
  env,
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
