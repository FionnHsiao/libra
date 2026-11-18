import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const PROFILE = path.join(os.tmpdir(), 'libra-argv-profile')
const ROOT_FILE = 'E:/libra-probe-root.html'
fs.writeFileSync(ROOT_FILE, '<!doctype html><meta charset="utf-8"><h1>根目录文件</h1><p>ARGV-OK</p>', 'utf8')

const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', ROOT_FILE, '--remote-debugging-port=9513', `--user-data-dir=${PROFILE}`], { cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
child.stdout.on('data', (d) => { log += d.toString() })
child.stderr.on('data', (d) => { log += d.toString() })
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
  await sleep(4000)
  const list = await (await fetch('http://127.0.0.1:9513/json/list')).json()
  console.log('targets:', list.map((t) => `${t.type}|${t.title}|${t.url.slice(0, 60)}`).join('  //  '))

  const shellTarget = list.find((t) => t.url.startsWith('file://'))
  const shell = await connect(shellTarget.webSocketDebuggerUrl)
  console.log('tabs:', await shell.evaluate(`JSON.stringify([...document.querySelectorAll('.tab .tab-name')].map((e) => e.textContent))`))
  console.log('tree:', await shell.evaluate(`JSON.stringify([...document.querySelectorAll('.panel-left .tree-row')].map((e) => e.textContent.trim()).slice(0, 6))`))
  console.log('status:', await shell.evaluate(`document.querySelector('.titlebar-title')?.textContent ?? ''`))
  shell.close()

  await sleep(600)
  const after = await (await fetch('http://127.0.0.1:9513/json/list')).json()
  const prev = after.find((t) => t.url.startsWith('libra-file://'))
  if (prev) {
    const pv = await connect(prev.webSocketDebuggerUrl)
    console.log('preview url:', prev.url.slice(0, 80))
    console.log('preview body:', (await pv.evaluate(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 60)`)) || '(空)')
    pv.close()
  } else {
    console.log('preview: 没有预览目标')
  }

  console.log('--- app log ---')
  console.log(log.trim().slice(0, 1200) || '(no output)')
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
  if (fs.existsSync(ROOT_FILE)) fs.unlinkSync(ROOT_FILE)
}