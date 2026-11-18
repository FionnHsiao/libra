import { execFile, spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const PROFILE = path.join(os.tmpdir(), 'libra-live-profile')
const PORT = 9581
const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE], { cwd: PROJECT, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = async () => (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()

async function connect(url) {
  const ws = new WebSocket(url)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let seq = 0
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = (seq += 1)
    const h = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== id) return
      ws.removeEventListener('message', h)
      if (m.error) return reject(new Error(JSON.stringify(m.error)))
      resolve(m.result)
    }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({ id, method, params }))
  })
  return {
    call,
    evaluate: async (e) => (await call('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value,
    close: () => ws.close()
  }
}

try {
  await sleep(3200)
  const shell = await connect((await list()).find((t) => t.url.endsWith('index.html')).webSocketDebuggerUrl)

  await shell.evaluate('(() => { const rows = [...document.querySelectorAll(".panel-left .tree-row")]; const f = rows.find((el) => !el.querySelector(".chev")); if (f) f.click() })()')
  await sleep(1600)

  // 打开视图菜单
  await shell.evaluate('[...document.querySelectorAll(".menubar-button")].find((b) => b.textContent.trim() === "视图").click()')
  await sleep(700)
  const openBefore = await shell.evaluate('document.querySelectorAll(".menubar-button.open").length')
  console.log('menu open:', openBefore)

  // 在预览页里点一下（原生视图，事件不会到主窗口 DOM）
  const previewTarget = (await list()).find((t) => t.url.startsWith('libra-file://'))
  const pv = await connect(previewTarget.webSocketDebuggerUrl)
  await pv.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 120, y: 120, button: 'left', clickCount: 1 })
  await pv.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 120, y: 120, button: 'left', clickCount: 1 })
  pv.close()
  await sleep(700)
  console.log('after clicking preview, menu open:', await shell.evaluate('document.querySelectorAll(".menubar-button.open").length'))

  // 再开一次，点文件树区域
  await shell.evaluate('[...document.querySelectorAll(".menubar-button")].find((b) => b.textContent.trim() === "视图").click()')
  await sleep(700)
  await shell.evaluate('document.querySelector(".panel-left").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))')
  await sleep(700)
  console.log('after clicking tree, menu open:', await shell.evaluate('document.querySelectorAll(".menubar-button.open").length'))

  shell.close()
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}