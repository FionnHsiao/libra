import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const PROFILE = path.join(os.tmpdir(), 'libra-shot-profile4')
const PORT = 9521
const INSPECT = 9292
const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', `--remote-debugging-port=${PORT}`, `--inspect=${INSPECT}`, `--user-data-dir=${PROFILE}`], { cwd: PROJECT, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const grab = (out) => new Promise((res) => {
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${PROJECT}/test/grab.ps1`, '-ProcessId', String(child.pid), '-Out', out], (e, so) => res(so.trim()))
})

try {
  await sleep(2800)
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const ws = new WebSocket(targets.find((t) => t.url.startsWith('file://')).webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let seq = 0
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = (seq += 1)
    const h = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== id) return
      ws.removeEventListener('message', h)
      if (m.error) return reject(new Error(JSON.stringify(m.error)))
      if (m.result?.exceptionDetails) return reject(new Error(String(m.result.exceptionDetails.exception?.description)))
      resolve(m.result)
    }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value

  for (let i = 1; i <= 3; i += 1) {
    await evaluate(`(() => { const row = [...document.querySelectorAll('.tree-row')].find((el) => el.textContent.trim() === ${JSON.stringify('第' + i + '篇-读书笔记.html')}); if (row) row.click() })()`)
    await sleep(300)
  }
  await sleep(700)

  const mlist = await (await fetch(`http://127.0.0.1:${INSPECT}/json/list`)).json()
  const mws = new WebSocket((mlist.find((x) => x.type === 'node') ?? mlist[0]).webSocketDebuggerUrl)
  await new Promise((r, j) => { mws.onopen = r; mws.onerror = j })
  const main = (expression) => new Promise((resolve) => {
    const h = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== 31) return
      mws.removeEventListener('message', h)
      resolve(m.result?.result?.value)
    }
    mws.addEventListener('message', h)
    mws.send(JSON.stringify({ id: 31, method: 'Runtime.evaluate', params: { expression, returnByValue: true, includeCommandLineAPI: true } }))
  })
  const repaint = async () => {
    await main(`(() => {
      const w = require('electron').BrowserWindow.getAllWindows()[0]
      if (w.isMinimized()) w.restore(); w.show(); w.focus(); w.moveTop()
      const [width, height] = w.getSize()
      w.setSize(width, height + 1)
      setTimeout(() => w.setSize(width, height), 60)
      return 'ok'
    })()`)
    await sleep(1300)
  }

  // 先把窗口提到前台，保证预览有绘制表面（截图依赖这个）
  await repaint()
  await sleep(600)

  const shot = await evaluate(`(async () => {
    try {
      const data = await window.libra.capturePreview()
      return data ? 'ok:' + data.length : 'null'
    } catch (error) {
      return 'err:' + error.message
    }
  })()`)
  console.log('capturePreview ->', shot)

  // 打开页签列表（一定会盖到正文）
  await evaluate(`document.querySelector('.tab-list-toggle').click()`)
  await sleep(1200)
  console.log('dropdown:', await evaluate(`document.querySelectorAll('.tab-list-item').length`))
  console.log('bg set:', await evaluate(`!!document.querySelector('.preview-host')?.style.backgroundImage`))
  console.log(await grab(path.join(os.tmpdir(), 'menu-frozen.png')))

  mws.close()
  ws.close()
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}