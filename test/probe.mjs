import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const PROFILE = path.join(os.tmpdir(), 'libra-shot-profile4')
const PORT = 9531
const INSPECT = 9293
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

  const mlist = await (await fetch(`http://127.0.0.1:${INSPECT}/json/list`)).json()
  const mws = new WebSocket((mlist.find((x) => x.type === 'node') ?? mlist[0]).webSocketDebuggerUrl)
  await new Promise((r, j) => { mws.onopen = r; mws.onerror = j })
  const main = (expression) => new Promise((resolve) => {
    const h = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== 41) return
      mws.removeEventListener('message', h)
      resolve(m.result?.result?.value)
    }
    mws.addEventListener('message', h)
    mws.send(JSON.stringify({ id: 41, method: 'Runtime.evaluate', params: { expression, returnByValue: true, includeCommandLineAPI: true } }))
  })

  // 窗口提到前台 + 打开一个文件
  await main(`(() => { const w = require('electron').BrowserWindow.getAllWindows()[0]; if (w.isMinimized()) w.restore(); w.show(); w.focus(); w.moveTop(); return 'ok' })()`)
  await sleep(600)
  await evaluate(`(() => { const row = [...document.querySelectorAll('.tree-row')].find((el) => el.textContent.trim() === '第3篇-读书笔记.html'); if (row) row.click() })()`)
  await sleep(1500)

  await main(`(() => { const w = require('electron').BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); w.moveTop(); return 'ok' })()`)
  await sleep(500)
  const canCapture = await evaluate(`(async () => { const d = await window.libra.capturePreview(); return d ? 'ok' : 'null' })()`)
  console.log('capture check:', canCapture)

  // 采样：点「帮助」之后，弹层和冻结画面出现的先后
  const timeline = await evaluate(`(async () => {
    const samples = []
    const start = performance.now()
    const button = [...document.querySelectorAll('.menubar-button')].find((b) => b.textContent.trim() === '帮助')
    button.click()
    for (let i = 0; i < 40; i += 1) {
      const dropdown = document.querySelectorAll('.menu-dropdown').length
      const frozen = !!document.querySelector('.preview-host')?.style.backgroundImage
      samples.push([Math.round(performance.now() - start), dropdown, frozen])
      if (dropdown && frozen) break
      await new Promise((r) => requestAnimationFrame(() => r()))
    }
    return JSON.stringify(samples)
  })()`)
  console.log('timeline:', timeline)

  await sleep(700)
  console.log(await grab(path.join(os.tmpdir(), 'help-menu.png')))

  // 关闭菜单，检查定格图是否被清掉、视图是否复原
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(60)
  console.log('after close 60ms:', await evaluate(`JSON.stringify({ dropdown: document.querySelectorAll('.menu-dropdown').length, frozen: !!document.querySelector('.preview-host')?.style.backgroundImage })`))
  await sleep(400)
  console.log('after close 460ms:', await evaluate(`JSON.stringify({ dropdown: document.querySelectorAll('.menu-dropdown').length, frozen: !!document.querySelector('.preview-host')?.style.backgroundImage })`))
  console.log(await grab(path.join(os.tmpdir(), 'help-closed.png')))

  mws.close()
  ws.close()
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}