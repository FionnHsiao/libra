import { execFile, spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const FIXTURE = `${PROJECT}/test/fixtures/sample-gbk.html`
const PROFILE = path.join(os.tmpdir(), 'libra-test-profile')
const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', FIXTURE, `--user-data-dir=${PROFILE}`], { cwd: PROJECT, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const grab = (out) => new Promise((res) => {
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${PROJECT}/test/grab.ps1`, '-ProcessId', String(child.pid), '-Out', out], (e, so) => res(so.trim()))
})

try {
  await sleep(3000)
  console.log('3s  grab:', await grab(path.join(os.tmpdir(), 'probe-3s.png')))
  await sleep(2000)
  console.log('5s  grab:', await grab(path.join(os.tmpdir(), 'probe-5s.png')))
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}