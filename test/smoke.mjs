import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const FIXTURE = `${PROJECT}/test/fixtures/sample-gbk.html`
const PORT = 9333
const PROFILE = path.join(os.tmpdir(), 'libra-test-profile')

const hash = () => createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex')
const before = hash()

const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', FIXTURE, `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`], {
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
  const mainTarget = targets.find((t) => t.type === 'page' && (t.url.startsWith('file://') || t.url.startsWith('http://localhost')))
  shell = await attach(mainTarget.webSocketDebuggerUrl)
  await sleep(2600)

  const ui = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      hasEditor: !!document.querySelector('.cm-editor'),
      editorHidden: getComputedStyle(document.querySelector('.editor-pane')).display === 'none',
      treeRows: document.querySelectorAll('.panel-left .tree-row').length,
      activeName: document.querySelector('.tree-row.active .tree-label')?.textContent ?? '',
      outlinePanels: document.querySelectorAll('.panel-right').length,
      hasMenubar: document.querySelectorAll('.menubar-button').length,
      bodyBg: getComputedStyle(document.body).backgroundColor
    })`)
  )
  check('默认进入阅读模式（源码隐藏）', ui.hasEditor && ui.editorHidden, `display=${ui.editorHidden ? 'none' : 'block'}`)
  check('左侧文件树列出根目录与文件', ui.treeRows >= 3, `${ui.treeRows} 行，当前 ${ui.activeName}`)
  check('浅色主题生效', ui.bodyBg === 'rgb(247, 244, 236)', ui.bodyBg)
  check('标题栏内的自绘菜单', ui.hasMenubar === 4, `${ui.hasMenubar} 个菜单`)
  check('大纲默认隐藏', ui.outlinePanels === 0, `${ui.outlinePanels} 个面板`)

  await shell.evaluate(`document.querySelector('.outline-toggle').click()`)
  await sleep(600)

  const layout = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      leftRight: Math.round(document.querySelector('.panel-left')?.getBoundingClientRect().right ?? -1),
      previewLeft: Math.round(document.querySelector('.preview-host')?.getBoundingClientRect().left ?? -1),
      previewRight: Math.round(document.querySelector('.preview-host')?.getBoundingClientRect().right ?? -1),
      rightLeft: Math.round(document.querySelector('.panel-right')?.getBoundingClientRect().left ?? -1),
      outlineItems: document.querySelectorAll('.panel-right .outline-item').length
    })`)
  )
  check(
    '点按钮后出现大纲，三栏排布',
    layout.outlineItems > 0 && layout.leftRight <= layout.previewLeft && layout.previewRight <= layout.rightLeft,
    `左 ends ${layout.leftRight}，预览 ${layout.previewLeft}-${layout.previewRight}，右 starts ${layout.rightLeft}`
  )

  preview = await attach((await listTargets()).find((t) => t.url.startsWith('libra-file://')).webSocketDebuggerUrl)
  await sleep(500)
  const rendered = JSON.parse(
    await preview.evaluate(`JSON.stringify({
      heading: document.querySelector('h1')?.textContent ?? '',
      paragraphs: document.querySelectorAll('p').length
    })`)
  )
  check('渲染出真实 DOM 而不是源码', rendered.heading === '中文标题', JSON.stringify(rendered))
  check('从渲染结果提取目录（单标题文档）', layout.outlineItems === 1, `${layout.outlineItems} 项`)

  await shell.evaluate(`[...document.querySelectorAll('.panel-left .tree-row')].find((el) => el.textContent.trim() === 'another.html').click()`)
  await sleep(1800)

  const afterSwitch = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      activeName: document.querySelector('.tree-row.active .tree-label')?.textContent ?? '',
      tabs: document.querySelectorAll('.tab').length,
      tabNames: [...document.querySelectorAll('.tab .tab-name')].map((el) => el.textContent),
      levels: [...new Set([...document.querySelectorAll('.outline-item')].map((el) => el.className.match(/level-(\\d)/)?.[1] ?? '?'))]
    })`)
  )
  check('打开的文件成为新的标签页', afterSwitch.tabs === 2, afterSwitch.tabNames.join(' | '))
  check('切换文件后目录自动重建', afterSwitch.activeName === 'another.html' && afterSwitch.levels.length === 3, `层级 ${afterSwitch.levels.join('/')}`)

  preview.close()
  preview = await attach((await listTargets()).find((t) => t.url.startsWith('libra-file://')).webSocketDebuggerUrl)
  const scrollBefore = await preview.evaluate('window.scrollY')
  await shell.evaluate(`document.querySelectorAll('.outline-item')[3].click()`)
  await sleep(1200)
  const scrollAfter = await preview.evaluate('window.scrollY')
  check('点目录跳到文档对应位置', scrollAfter > scrollBefore + 100, `scrollY ${scrollBefore} -> ${scrollAfter}`)

  await shell.evaluate(`[...document.querySelectorAll('.menubar-button')].find((b) => b.textContent.trim() === '视图').click()`)
  await sleep(250)
  await shell.evaluate(`[...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('文件列表')).click()`)
  await sleep(500)
  const hiddenByMenu = await shell.evaluate(`document.querySelectorAll('.panel-left').length`)
  await shell.evaluate(`[...document.querySelectorAll('.menubar-button')].find((b) => b.textContent.trim() === '视图').click()`)
  await sleep(250)
  const checkedByMenu = await shell.evaluate(
    `[...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('文件列表'))?.querySelector('.menu-check')?.textContent ?? ''`
  )
  await shell.evaluate(`[...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('文件列表')).click()`)
  await sleep(500)
  const restoredByMenu = await shell.evaluate(`document.querySelectorAll('.panel-left').length`)
  check('菜单项切换文件列表并同步勾选', hiddenByMenu === 0 && checkedByMenu === '' && restoredByMenu === 1, `隐藏 ${hiddenByMenu}，勾选 "${checkedByMenu}"，恢复 ${restoredByMenu}`)

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

  await shell.evaluate(`document.querySelector('.tab.active .tab-close').click()`)
  await sleep(700)
  const afterClose = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      tabs: document.querySelectorAll('.tab').length,
      active: document.querySelector('.tab.active .tab-name')?.textContent ?? ''
    })`)
  )
  check('关闭标签页后回到上一个文档', afterClose.tabs === 1 && afterClose.active === 'sample-gbk.html', `${afterClose.tabs} 个，当前 ${afterClose.active}`)
} finally {
  preview?.close()
  shell?.close()
  await stopApp(child)
  await sleep(400)
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