import { execFile, spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const FIXTURE = `${PROJECT}/test/fixtures/another.html`
const PORT = 9447
const PROFILE = path.join(os.tmpdir(), 'libra-test-profile')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', FIXTURE, `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`], { cwd: PROJECT, stdio: 'ignore' })

const grab = (out) => new Promise((res) => {
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${PROJECT}/test/grab.ps1`, '-ProcessId', String(child.pid), '-Out', out], (e, so) => res(so.trim()))
})

try {
  await sleep(4500)
  console.log(await grab(path.join(os.tmpdir(), 'libra-final.png')))
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}