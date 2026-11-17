import { spawn, execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const FIXTURE = `${PROJECT}/test/fixtures/sample-gbk.html`
const PORT = 9445
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const grab = (out) => new Promise((res) => {
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${PROJECT}/test/grab.ps1`, '-Match', 'Libra', '-Out', out], (e, so) => res(so.trim()))
})

const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', FIXTURE, `--remote-debugging-port=${PORT}`], { cwd: PROJECT, stdio: 'ignore' })

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

  await sleep(2500)
  console.log(await grab(path.join(os.tmpdir(), 'libra-read.png')))

  await evaluate(`document.querySelector('.segmented button:nth-of-type(2)').click()`)
  await sleep(1500)
  console.log(await grab(path.join(os.tmpdir(), 'libra-edit.png')))
} finally {
  ws?.close()
  child.kill()
  await sleep(600)
}