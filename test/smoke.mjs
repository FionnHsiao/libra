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

async function listTargets() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      if (list.some((t) => t.type === 'page')) return list
    } catch {
      /* not up yet */
    }
    await sleep(400)
  }
  throw new Error('devtools target never appeared')
}

async function attach(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl)
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
  return { evaluate, close: () => ws.close() }
}

const results = []
const check = (name, pass, detail) => results.push([name, pass, detail])

let shell
let preview
try {
  const targets = await listTargets()
  const mainTarget = targets.find((t) => t.type === 'page' && !t.url.startsWith('libra-file://'))
  shell = await attach(mainTarget.webSocketDebuggerUrl)
  await sleep(1800)

  const ui = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      title: document.title,
      hasEditor: !!document.querySelector('.cm-editor'),
      editorHidden: getComputedStyle(document.querySelector('.editor-pane')).display === 'none',
      fileItems: document.querySelectorAll('.file-item').length,
      activeName: document.querySelector('.file-item.active')?.textContent ?? '',
      status: document.querySelector('.status-meta')?.textContent ?? '',
      bodyBg: getComputedStyle(document.body).backgroundColor
    })`)
  )
  check('默认进入阅读模式（源码隐藏）', ui.hasEditor && ui.editorHidden, `display=${ui.editorHidden ? 'none' : 'block'}`)
  check('左侧文件列表列出同目录 HTML', ui.fileItems >= 2, `${ui.fileItems} 个，当前 ${ui.activeName}`)
  check('浅色主题生效', ui.bodyBg === 'rgb(247, 244, 236)', ui.bodyBg)

  const previewTargets = (await listTargets()).filter((t) => t.url.startsWith('libra-file://'))
  check('预览运行在独立进程 / 独立 origin', previewTargets.length === 1, previewTargets[0]?.url ?? '未找到')

  if (previewTargets.length > 0) {
    preview = await attach(previewTargets[0].webSocketDebuggerUrl)
    await sleep(600)
    const rendered = JSON.parse(
      await preview.evaluate(`JSON.stringify({
        title: document.title,
        heading: document.querySelector('h1')?.textContent ?? '',
        paragraphs: document.querySelectorAll('p').length
      })`)
    )
    check('渲染出真实 DOM 而不是源码', rendered.heading === '中文标题' && rendered.paragraphs === 1, JSON.stringify(rendered))
  }

  const doc = JSON.parse(
    await shell.evaluate(`(async () => {
      const d = await window.libra.read(${JSON.stringify(FIXTURE)})
      return JSON.stringify({ encoding: d.encoding, bom: d.bom, eol: d.eol, size: d.size, text: d.text })
    })()`)
  )
  check('GBK / CRLF 识别正确', doc.encoding === 'gb18030' && doc.eol === 'CRLF' && doc.size === 197, `${doc.encoding} / ${doc.eol} / ${doc.size}B`)

  const passthrough = JSON.parse(
    await shell.evaluate(`(async () => {
      const d = await window.libra.read(${JSON.stringify(FIXTURE)})
      return JSON.stringify(await window.libra.save({ path: d.path, text: d.text, encoding: d.encoding, bom: d.bom, eol: d.eol }))
    })()`)
  )
  check('原样保存不改一个字节', passthrough.ok && hash() === before, `bytes=${passthrough.bytes}`)

  const edited = JSON.parse(
    await shell.evaluate(`(async () => {
      const d = await window.libra.read(${JSON.stringify(FIXTURE)})
      const text = d.text.replace('中文标题', '中文标题（已编辑）')
      await window.libra.save({ path: d.path, text, encoding: d.encoding, bom: d.bom, eol: d.eol })
      const again = await window.libra.read(d.path)
      return JSON.stringify({ changed: again.text.includes('已编辑'), encoding: again.encoding, eol: again.eol })
    })()`)
  )
  check('编辑中文后编码与换行保持', edited.changed && edited.encoding === 'gb18030' && edited.eol === 'CRLF', JSON.stringify(edited))

  await shell.evaluate(`(async () => {
    const d = await window.libra.read(${JSON.stringify(FIXTURE)})
    return window.libra.save({ path: d.path, text: ${JSON.stringify(doc.text)}, encoding: ${JSON.stringify(doc.encoding)}, bom: ${doc.bom}, eol: ${JSON.stringify(doc.eol)} })
  })()`)
  check('恢复原文后字节完全一致', hash() === before, `sha=${hash().slice(0, 12)}`)
} finally {
  preview?.close()
  shell?.close()
  child.kill()
  await sleep(800)
}

let failed = 0
for (const [name, pass, detail] of results) {
  if (!pass) failed += 1
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  —  ${detail}`)
}
const errLines = logs.split(/\r?\n/).filter((l) => /\berror\b/i.test(l) && !l.includes('DevTools'))
if (errLines.length) console.log('LOG-ERRORS:', errLines.slice(0, 6).join(' | '))
console.log(failed === 0 ? '\nALL PASSED' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)