import { execFile, spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const FIXTURE = `${PROJECT}/test/fixtures/another.html`
const PORT = 9446
const PROFILE = path.join(os.tmpdir(), 'libra-test-profile')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const run = (file, args) => new Promise((res) => {
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], (e, so) => res(so.trim()))
})
const grab = (out) => run(`${PROJECT}/test/grab.ps1`, ['-Match', 'Libra', '-Out', out])
const keys = (combo) => run(`${PROJECT}/test/keys.ps1`, ['-Match', 'Libra', '-Keys', combo])

const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', FIXTURE, `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`], { cwd: PROJECT, stdio: 'ignore' })

async function findTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && !t.url.startsWith('libra-file://'))
      if (page?.webSocketDebuggerUrl) return page
    } catch {}
    await sleep(400)
  }
  throw new Error('no target')
}

let ws
try {
  const target = await findTarget()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let seq = 0
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const id = (seq += 1)
    const handler = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', handler)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result?.result?.value)
    }
    ws.addEventListener('message', handler)
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })

  await sleep(2600)
  console.log(await grab(path.join(os.tmpdir(), 'libra-outline.png')))

  console.log(await keys('^b'))
  await sleep(900)
  const hidden = await evaluate(`document.querySelectorAll('.sidebar').length`)
  console.log('sidebar after ^b:', hidden)
  console.log(await grab(path.join(os.tmpdir(), 'libra-nosidebar.png')))

  console.log(await keys('^b'))
  await sleep(700)
  const shown = await evaluate(`document.querySelectorAll('.sidebar').length`)
  console.log('sidebar after second ^b:', shown)
} finally {
  ws?.close()
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}