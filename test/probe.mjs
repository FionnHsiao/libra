import { execFile, spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const PROFILE = path.join(os.tmpdir(), 'libra-shot-profile4')
const PORT = 9563
const INSPECT = 9298
const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', '--remote-debugging-port=' + PORT, '--inspect=' + INSPECT, '--user-data-dir=' + PROFILE], { cwd: PROJECT, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const grab = (out) => new Promise((res) => {
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${PROJECT}/test/grab.ps1`, '-ProcessId', String(child.pid), '-Out', out], (e, so) => res(so.trim()))
})

async function connect(url) {
  const ws = new WebSocket(url)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let seq = 0
  const evaluate = (expr) => new Promise((resolve) => {
    const id = (seq += 1)
    const h = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== id) return
      ws.removeEventListener('message', h)
      resolve(m.result?.result?.value)
    }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, includeCommandLineAPI: true } }))
  })
  return { evaluate, close: () => ws.close() }
}

try {
  await sleep(3000)
  const shell = await connect((await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()).find((t) => t.url.endsWith('index.html')).webSocketDebuggerUrl)
  await shell.evaluate('(() => { const rows = [...document.querySelectorAll(".panel-left .tree-row")]; const f = rows.find((el) => !el.querySelector(".chev")); if (f) f.click() })()')
  await sleep(1500)

  const mlist = await (await fetch('http://127.0.0.1:' + INSPECT + '/json/list')).json()
  const main = await connect((mlist.find((x) => x.type === 'node') ?? mlist[0]).webSocketDebuggerUrl)
  await main.evaluate('(() => { const w = require("electron").BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); w.moveTop(); return "ok" })()')
  await sleep(900)

  await shell.evaluate('[...document.querySelectorAll(".menubar-button")].find((b) => b.textContent.trim() === "帮助").click()')
  await sleep(600)

  await main.evaluate('(() => { const w = require("electron").BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); w.moveTop(); const [a, b] = w.getSize(); w.setSize(a, b + 1); setTimeout(() => w.setSize(a, b), 60); return "ok" })()')
  await sleep(1500)

  console.log(await grab(path.join(os.tmpdir(), 'overlay-shadow.png')))

  shell.close()
  main.close()
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}