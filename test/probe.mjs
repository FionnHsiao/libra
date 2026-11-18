import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const PROFILE = path.join(os.tmpdir(), 'libra-shot-profile4')
const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', '--remote-debugging-port=9512', `--user-data-dir=${PROFILE}`], { cwd: PROJECT, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  await sleep(2500)
  const targets = await (await fetch('http://127.0.0.1:9512/json/list')).json()
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

  for (let i = 1; i <= 9; i += 1) {
    await evaluate(`(() => { const row = [...document.querySelectorAll('.tree-row')].find((el) => el.textContent.trim() === ${JSON.stringify('第' + i + '篇-读书笔记.html')}); if (row) row.click() })()`)
    await sleep(280)
  }
  await sleep(900)

  console.log(await evaluate(`JSON.stringify({
    innerWidth,
    tabbar: (() => { const r = document.querySelector('.tabbar').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width)] })(),
    tabs: (() => { const el = document.querySelector('.tabs'); const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), scrollLeft: Math.round(el.scrollLeft), scrollWidth: el.scrollWidth, justify: getComputedStyle(el).justifyContent, overflowX: getComputedStyle(el).overflowX } })(),
    actions: (() => { const r = document.querySelector('.tab-actions').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width)] })(),
    activeTab: (() => { const el = document.querySelector('.tab.active'); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width), el.textContent.trim()] })()
  })`))
  ws.close()
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}