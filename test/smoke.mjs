import { execFile, spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import fs from 'node:fs'

const PROJECT = 'E:/Libra/libra'
const FIXTURE = `${PROJECT}/test/fixtures/sample-gbk.html`
const LONG = `${PROJECT}/test/fixtures/another.html`
const PORT = 9333
const INSPECT = 9229
const PROFILE = path.join(os.tmpdir(), 'libra-test-profile')

const hash = () => createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex')
const before = hash()

const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', FIXTURE, `--remote-debugging-port=${PORT}`, `--inspect=${INSPECT}`, `--user-data-dir=${PROFILE}`], {
  cwd: PROJECT,
  stdio: ['ignore', 'pipe', 'pipe']
})
let logs = ''
child.stdout.on('data', (d) => { logs += d.toString() })
child.stderr.on('data', (d) => { logs += d.toString() })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stopApp = (proc) => new Promise((resolve) => {
  if (!proc.pid) { resolve(); return }
  execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], () => resolve())
})

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
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true } }))
    })
  return { evaluate, close: () => ws.close() }
}

const results = []
const check = (name, pass, detail) => results.push([name, pass, detail])

let shell
let preview
let mainProc
try {
  const targets = await listTargets()
  const mainTarget = targets.find((t) => t.type === 'page' && (t.url.startsWith('file://') || t.url.startsWith('http://localhost')))
  shell = await attach(mainTarget.webSocketDebuggerUrl)
  await sleep(1900)

  mainProc = null
  for (let i = 0; i < 40 && !mainProc; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${INSPECT}/json/list`)).json()
      const nodeTarget = list.find((t) => t.type === 'node') ?? list[0]
      if (nodeTarget?.webSocketDebuggerUrl) mainProc = await attach(nodeTarget.webSocketDebuggerUrl)
    } catch {
      await sleep(300)
    }
  }

  const menuClick = `(() => {
    const m = require('electron').Menu.getApplicationMenu().getMenuItemById('files-toggle')
    m.click()
    return m.checked
  })()`
  const menuChecked = () =>
    mainProc.evaluate(`String(require('electron').Menu.getApplicationMenu().getMenuItemById('files-toggle').checked)`)

  const ui = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      hasEditor: !!document.querySelector('.cm-editor'),
      editorHidden: getComputedStyle(document.querySelector('.editor-pane')).display === 'none',
      fileItems: document.querySelectorAll('.file-item').length,
      activeName: document.querySelector('.file-item.active')?.textContent ?? '',
      outline: document.querySelectorAll('.outline-item').length,
      bodyBg: getComputedStyle(document.body).backgroundColor
    })`)
  )
  check('默认进入阅读模式（源码隐藏）', ui.hasEditor && ui.editorHidden, `display=${ui.editorHidden ? 'none' : 'block'}`)
  check('左侧文件列表列出同目录 HTML', ui.fileItems >= 2, `${ui.fileItems} 个，当前 ${ui.activeName}`)
  check('浅色主题生效', ui.bodyBg === 'rgb(247, 244, 236)', ui.bodyBg)

  const layout = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      leftRight: Math.round(document.querySelector('.panel-left')?.getBoundingClientRect().right ?? -1),
      previewLeft: Math.round(document.querySelector('.preview-host')?.getBoundingClientRect().left ?? -1),
      previewRight: Math.round(document.querySelector('.preview-host')?.getBoundingClientRect().right ?? -1),
      rightLeft: Math.round(document.querySelector('.panel-right')?.getBoundingClientRect().left ?? -1),
      outlineInRight: document.querySelectorAll('.panel-right .outline-item').length
    })`)
  )
  check(
    '左文件列表 / 中预览 / 右大纲 三栏排布',
    layout.leftRight <= layout.previewLeft &&
      layout.previewRight <= layout.rightLeft &&
      layout.outlineInRight > 0,
    `左 ends ${layout.leftRight}，预览 ${layout.previewLeft}-${layout.previewRight}，右 starts ${layout.rightLeft}，右侧大纲 ${layout.outlineInRight} 项`
  )

  preview = await attach(
    (await listTargets()).find((t) => t.url.startsWith('libra-file://')).webSocketDebuggerUrl
  )
  await sleep(500)
  const rendered = JSON.parse(
    await preview.evaluate(`JSON.stringify({
      title: document.title,
      heading: document.querySelector('h1')?.textContent ?? '',
      paragraphs: document.querySelectorAll('p').length
    })`)
  )
  check('渲染出真实 DOM 而不是源码', rendered.heading === '中文标题', JSON.stringify(rendered))
  check('从渲染结果提取目录（单标题文档）', ui.outline === 1, `${ui.outline} 项`)

  await shell.evaluate(`[...document.querySelectorAll('.file-item')].find(el => el.textContent.trim() === 'another.html').click()`)
  await sleep(1800)

  const afterSwitch = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      activeName: document.querySelector('.file-item.active')?.textContent ?? '',
      outline: [...document.querySelectorAll('.outline-item')].map(el => el.className.match(/level-(\\d)/)?.[1] ?? '?'),
      titles: [...document.querySelectorAll('.outline-item')].map(el => el.textContent)
    })`)
  )
  check(
    '切换文件后目录自动重建',
    afterSwitch.activeName === 'another.html' && afterSwitch.outline.length >= 6,
    `${afterSwitch.outline.length} 项，层级 ${[...new Set(afterSwitch.outline)].join('/')}`
  )
  check('目录识别 h1/h2/h3 层级', new Set(afterSwitch.outline).size === 3, [...new Set(afterSwitch.outline)].join(' / '))

  preview.close()
  preview = await attach(
    (await listTargets()).find((t) => t.url.startsWith('libra-file://')).webSocketDebuggerUrl
  )
  const scrollBefore = await preview.evaluate('window.scrollY')

  await shell.evaluate(`document.querySelectorAll('.outline-item')[3].click()`)
  await sleep(1200)
  const scrollAfter = await preview.evaluate('window.scrollY')
  check('点目录跳到文档对应位置', scrollAfter > scrollBefore + 100, `scrollY ${scrollBefore} -> ${scrollAfter}`)

  await mainProc.evaluate(menuClick)
  await sleep(600)
  const hiddenByMenu = await shell.evaluate(`document.querySelectorAll('.panel-left').length`)
  const checkedHidden = await menuChecked()
  await mainProc.evaluate(menuClick)
  await sleep(600)
  const shownByMenu = await shell.evaluate(`document.querySelectorAll('.panel-left').length`)
  const checkedShown = await menuChecked()
  check(
    '菜单项切换文件列表并同步勾选',
    hiddenByMenu === 0 && checkedHidden === 'false' && shownByMenu === 1 && checkedShown === 'true',
    `文件栏 ${hiddenByMenu}/${shownByMenu}，勾选 ${checkedHidden}/${checkedShown}`
  )

  const doc = JSON.parse(
    await shell.evaluate(`(async () => {
      const d = await window.libra.read(${JSON.stringify(FIXTURE)})
      return JSON.stringify({ encoding: d.encoding, eol: d.eol, size: d.size, text: d.text })
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
  mainProc?.close()
  shell?.close()
  await stopApp(child)
  await sleep(500)
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