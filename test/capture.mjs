import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const FIXTURE = `${PROJECT}/test/fixtures/sample-gbk.html`
const PORT = 9444
const OUT = path.join(os.tmpdir(), 'libra-shot.png')

const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', FIXTURE, `--remote-debugging-port=${PORT}`], { cwd: PROJECT, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page
    } catch {}
    await sleep(500)
  }
  throw new Error('no target')
}

let ws
try {
  const target = await findTarget()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let seq = 0
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = (seq += 1)
    const onMessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
  await sleep(1800)
  const shot = await call('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log('saved', OUT, fs.statSync(OUT).size)
} finally {
  if (ws) ws.close()
  child.kill()
}