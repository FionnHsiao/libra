import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const PROFILE = path.join(os.tmpdir(), 'libra-shot-profile3')
const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', '--remote-debugging-port=9504', `--user-data-dir=${PROFILE}`], { cwd: PROJECT, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  await sleep(2500)
  const targets = await (await fetch('http://127.0.0.1:9504/json/list')).json()
  const ws = new WebSocket(targets.find((t) => t.url.startsWith('file://')).webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let seq = 0
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const id = (seq += 1)
    const h = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== id) return
      ws.removeEventListener('message', h)
      if (m.error) return reject(new Error(JSON.stringify(m.error)))
      if (m.result?.exceptionDetails) return reject(new Error(String(m.result.exceptionDetails.exception?.description)))
      resolve(m.result?.result?.value)
    }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
  })

  const rect = (selector) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] })()`

  console.log('viewport:', await evaluate(`JSON.stringify({ w: innerWidth, h: innerHeight, scrollW: document.documentElement.scrollWidth })`))
  for (const sel of ['.app', '.titlebar', '.menubar', '.body', '.rail', '.workspace', '.panel-left', '.center', '.tabbar', '.tabs', '.tab-actions', '.content', '.preview-host']) {
    console.log(sel, await evaluate(rect(sel)))
  }
  ws.close()
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}