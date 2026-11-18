import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const PROFILE = path.join(os.tmpdir(), 'libra-test-profile')
const ROOT_FILE = 'E:/libra-probe-root.html'
const NESTED = 'E:/Libra-OpenTest/中文目录/测试页面.html'

fs.writeFileSync(ROOT_FILE, '<!doctype html><meta charset="utf-8"><h1>根目录文件</h1><p>ROOT-OK</p>', 'utf8')

const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', '--remote-debugging-port=9512', `--user-data-dir=${PROFILE}`], { cwd: PROJECT, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect(url) {
  const ws = new WebSocket(url)
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
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
  return { evaluate, close: () => ws.close() }
}

try {
  await sleep(3000)
  let list = await (await fetch('http://127.0.0.1:9512/json/list')).json()
  const shell = await connect(list.find((t) => t.url.startsWith('file://')).webSocketDebuggerUrl)

  for (const [label, target] of [['E:\\ 根目录', ROOT_FILE], ['嵌套中文目录', NESTED]]) {
    await shell.evaluate(`window.libra.loadPreview(${JSON.stringify(target)})`)
    await sleep(1000)
    list = await (await fetch('http://127.0.0.1:9512/json/list')).json()
    const prev = list.find((t) => t.url.startsWith('libra-file://'))
    const pv = await connect(prev.webSocketDebuggerUrl)
    const body = await pv.evaluate(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 60)`)
    console.log(label, '→', body)
    pv.close()
  }

  shell.close()
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
  if (fs.existsSync(ROOT_FILE)) fs.unlinkSync(ROOT_FILE)
}