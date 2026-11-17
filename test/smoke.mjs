import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'

const PROJECT = 'E:/Libra/libra'
const FIXTURE = `${PROJECT}/test/fixtures/sample-gbk.html`
const PORT = 9333

const hash = () => createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex')
const before = hash()

const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', FIXTURE, `--remote-debugging-port=${PORT}`], {
  cwd: PROJECT,
  stdio: ['ignore', 'pipe', 'pipe']
})
let logs = ''
child.stdout.on('data', (d) => { logs += d.toString() })
child.stderr.on('data', (d) => { logs += d.toString() })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page
    } catch {
      /* not up yet */
    }
    await sleep(500)
  }
  throw new Error('devtools target never appeared')
}

let ws
const results = []
try {
  const target = await findTarget()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let seq = 0
  const evaluate = (expression) =>
    new Promise((resolve, reject) => {
      const id = (seq += 1)
      const onMessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id !== id) return
        ws.removeEventListener('message', onMessage)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails)))
        else resolve(msg.result.result.value)
      }
      ws.addEventListener('message', onMessage)
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })

  await sleep(1500)

  const ui = JSON.parse(
    await evaluate(`JSON.stringify({
      title: document.title,
      hasEditor: !!document.querySelector('.cm-editor'),
      hasBridge: typeof window.libra === 'object',
      lines: document.querySelectorAll('.cm-line').length,
      status: document.querySelector('.status-meta')?.textContent ?? ''
    })`)
  )
  results.push(['界面渲染 + 文件关联打开', ui.hasEditor && ui.hasBridge && ui.lines > 5, JSON.stringify(ui)])

  const doc = JSON.parse(
    await evaluate(`(async () => {
      const d = await window.libra.read(${JSON.stringify(FIXTURE)})
      return JSON.stringify({ encoding: d.encoding, bom: d.bom, eol: d.eol, size: d.size, text: d.text })
    })()`)
  )
  results.push(['GBK / CRLF 识别正确', doc.encoding === 'gb18030' && doc.eol === 'CRLF' && doc.size === 197, `${doc.encoding} / ${doc.eol} / ${doc.size}B`])

  const passthrough = JSON.parse(
    await evaluate(`(async () => {
      const d = await window.libra.read(${JSON.stringify(FIXTURE)})
      return JSON.stringify(await window.libra.save({ path: d.path, text: d.text, encoding: d.encoding, bom: d.bom, eol: d.eol }))
    })()`)
  )
  results.push(['原样保存不改一个字节', passthrough.ok && hash() === before, `bytes=${passthrough.bytes}`])

  const edited = JSON.parse(
    await evaluate(`(async () => {
      const d = await window.libra.read(${JSON.stringify(FIXTURE)})
      const text = d.text.replace('中文标题', '中文标题（已编辑）')
      await window.libra.save({ path: d.path, text, encoding: d.encoding, bom: d.bom, eol: d.eol })
      const again = await window.libra.read(d.path)
      return JSON.stringify({ changed: again.text.includes('已编辑'), encoding: again.encoding, eol: again.eol })
    })()`)
  )
  results.push(['编辑中文后编码与换行保持', edited.changed && edited.encoding === 'gb18030' && edited.eol === 'CRLF', JSON.stringify(edited)])

  await evaluate(`(async () => {
    const d = await window.libra.read(${JSON.stringify(FIXTURE)})
    return window.libra.save({ path: d.path, text: ${JSON.stringify(doc.text)}, encoding: ${JSON.stringify(doc.encoding)}, bom: ${doc.bom}, eol: ${JSON.stringify(doc.eol)} })
  })()`)
  results.push(['恢复原文后字节完全一致', hash() === before, `sha=${hash().slice(0, 12)}`])
} finally {
  if (ws) ws.close()
  child.kill()
  await sleep(800)
}

let failed = 0
for (const [name, pass, detail] of results) {
  if (!pass) failed += 1
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  —  ${detail}`)
}
const errLines = logs.split(/\r?\n/).filter((l) => /\berror\b/i.test(l) && !l.includes('DevTools'))
if (errLines.length) console.log('LOG-ERRORS:', errLines.slice(0, 5).join(' | '))
console.log(failed === 0 ? '\nALL PASSED' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)