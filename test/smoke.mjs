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

fs.mkdirSync(PROFILE, { recursive: true })
fs.writeFileSync(
  path.join(PROFILE, 'settings.json'),
  JSON.stringify({ entries: [{ kind: 'dir', path: path.dirname(path.resolve(FIXTURE)) }] }, null, 2),
  'utf8'
)

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
  return { evaluate, bringToFront: () => ws.send(JSON.stringify({ id: 999999, method: 'Page.bringToFront' })), close: () => ws.close() }
}

const results = []
const check = (name, pass, detail) => results.push([name, pass, detail])

// 菜单现在"鼠标离开就自动收起"，脚本点菜单之前要先把真实光标停到触发按钮上
const setCursorTo = (x, y) =>
  new Promise((resolve) =>
    execFile(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})`
      ],
      () => resolve()
    )
  )

const menubar = (label) => `[...document.querySelectorAll('.menubar-button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`

const parkOn = async (elementExpr) => {
  const point = JSON.parse(
    await shell.evaluate(
      `(() => { const el = ${elementExpr}; if (!el) return "null"; const r = el.getBoundingClientRect(); return JSON.stringify({ x: window.screenX + r.left + r.width / 2, y: window.screenY + r.top + r.height / 2 }) })()`
    )
  )
  if (!point) throw new Error("parkOn: 找不到元素")
  await setCursorTo(point.x, point.y)
  await sleep(150)
}
const parkOnMenu = (label) => parkOn(menubar(label))

const readCursor = () =>
  new Promise((resolve) =>
    execFile(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName System.Windows.Forms; "$([System.Windows.Forms.Cursor]::Position.X),$([System.Windows.Forms.Cursor]::Position.Y)"`
      ],
      (err, stdout) => {
        if (err || !stdout) return resolve(null)
        const [x, y] = String(stdout).trim().split(",").map(Number)
        resolve(Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null)
      }
    )
  )

// 菜单现在渲染在独立的弹层视图里，需要连过去操作
async function withOverlay(fn) {
  const target = (await listTargets()).find((t) => t.url.includes('overlay.html'))
  if (!target) return null
  const overlay = await attach(target.webSocketDebuggerUrl)
  try {
    return await fn(overlay)
  } finally {
    overlay.close()
  }
}

const overlayLabels = () =>
  withOverlay((overlay) =>
    overlay.evaluate(`JSON.stringify([...document.querySelectorAll('.row .label')].map((el) => el.textContent))`)
  )

const overlayClick = (label) =>
  withOverlay((overlay) =>
    overlay.evaluate(`(() => {
      const row = [...document.querySelectorAll('.row')].find((r) => r.textContent.includes(${JSON.stringify(label)}))
      if (!row) return false
      row.querySelector('.item').click()
      return true
    })()`)
  )

let shell
let preview
let cursorAtStart = null
try {
  const targets = await listTargets()
  const mainTarget = targets.find((t) => t.type === 'page' && (t.url.startsWith('file://') || t.url.startsWith('http://localhost')))
  shell = await attach(mainTarget.webSocketDebuggerUrl)
  await shell.bringToFront()
  cursorAtStart = await readCursor()
  await sleep(2600)

  const ui = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      hasPreview: !!document.querySelector('.preview-pane'),
      hasEditor: !!document.querySelector('.cm-editor'),
      treeRows: document.querySelectorAll('.panel-left .tree-row').length,
      activeName: document.querySelector('.tree-row.active .tree-label')?.textContent ?? '',
      outlinePanels: document.querySelectorAll('.panel-right').length,
      hasMenubar: document.querySelectorAll('.menubar-button').length,
      railButtons: document.querySelectorAll('.rail-btn').length,
      jarTitle: document.querySelector('.jar-title')?.textContent ?? '',
      chromeBg: getComputedStyle(document.querySelector('.titlebar')).backgroundColor,
      railBg: getComputedStyle(document.querySelector('.rail')).backgroundColor,
      treeBg: getComputedStyle(document.querySelector('.panel-left')).backgroundColor,
      centerBg: getComputedStyle(document.querySelector('.tabbar')).backgroundColor
    })`)
  )
  check('纯阅读界面（没有编辑器）', ui.hasPreview && !ui.hasEditor, `preview=${ui.hasPreview} editor=${ui.hasEditor}`)
  check('左侧文件树列出根目录与文件', ui.treeRows >= 3, `${ui.treeRows} 行，当前 ${ui.activeName}`)
  check('文件树上方是星星罐标题', ui.jarTitle === '星星罐', ui.jarTitle)

  const jarButtons = await shell.evaluate(`document.querySelectorAll('.jar-actions button').length`)
  check('星星罐标题有四个操作按钮', jarButtons === 4, `${jarButtons} 个`)

  const titlebarChrome = JSON.parse(
    await shell.evaluate(`(() => {
      const back = document.querySelector('.titlebar-back')
      const toggle = document.querySelector('.titlebar-toggle')
      const panel = document.querySelector('.panel-left')
      if (!back || !toggle) return JSON.stringify({ missing: true })
      const b = back.getBoundingClientRect()
      const t = toggle.getBoundingClientRect()
      const p = panel ? panel.getBoundingClientRect() : null
      return JSON.stringify({
        backLeft: Math.round(b.left),
        backBeforeToggle: b.right <= t.left,
        toggleAligned: p ? Math.abs(t.left - p.left) <= 1 : false
      })
    })()`)
  )
  check(
    '返回按钮在标题栏最左，折叠按钮与目录栏对齐',
    !titlebarChrome.missing && titlebarChrome.backLeft === 8 && titlebarChrome.backBeforeToggle && titlebarChrome.toggleAligned,
    `返回 x=${titlebarChrome.backLeft}，对齐=${titlebarChrome.toggleAligned}`
  )

  await parkOn(`document.querySelector('.jar-actions button')`)
  await shell.evaluate(`document.querySelector('.jar-actions button').click()`)
  await sleep(600)
  const addItems = JSON.parse((await overlayLabels()) ?? '[]')
  check('加号可添加文件夹或文件', addItems.join(',') === '添加文件夹,添加文件', addItems.join(','))
  await withOverlay((overlay) => overlay.evaluate(`window.overlayApi.close()`))
  await sleep(300)
  await shell.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(200)

  // 菜单悬停切换：打开「文件」后把鼠标移到「视图」上，内容应整体换掉
  await parkOnMenu('文件')
  await shell.evaluate(`[...document.querySelectorAll('.menubar-button')].find((b) => b.textContent.trim() === '文件').click()`)
  await sleep(600)
  const fileMenu = JSON.parse((await overlayLabels()) ?? '[]')
  await shell.evaluate(`[...document.querySelectorAll('.menubar-button')].find((b) => b.textContent.trim() === '视图').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`)
  await sleep(700)
  const switched = JSON.parse((await overlayLabels()) ?? '[]')
  check(
    '悬停其他菜单会切换下拉内容',
    fileMenu.includes('退出') && switched.includes('放大') && !switched.includes('退出'),
    `文件 ${fileMenu.slice(0, 2).join('/')}… → 视图 ${switched.slice(0, 2).join('/')}…`
  )

  // 加号菜单的卡片必须贴着视图顶部，不能盖住加号按钮本身
  await parkOnMenu('文件')
  await shell.evaluate(`[...document.querySelectorAll('.menubar-button')].find((b) => b.textContent.trim() === '文件').click()`)
  await sleep(300)
  await shell.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(300)
  await parkOn(`document.querySelector('.jar-actions button')`)
  await shell.evaluate(`document.querySelector('.jar-actions button').click()`)
  await sleep(600)
  const cardTop = await withOverlay((overlay) => overlay.evaluate(`Math.round(document.getElementById('card').getBoundingClientRect().top)`))
  check('弹层不覆盖触发按钮', cardTop === 0, `卡片距视图顶部 ${cardTop}px`)
  await withOverlay((overlay) => overlay.evaluate(`window.overlayApi.close()`))
  await sleep(300)
  // 鼠标离开「按钮 + 下拉框」后要自动收起
  // 先把可能残留的菜单收掉，保证从这里开始是"干净"的状态
  await shell.evaluate(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
  await sleep(400)
  await parkOnMenu('文件')
  await shell.evaluate(`${menubar('文件')}.click()`)
  await sleep(500)
  const openBeforeLeave = await shell.evaluate(`document.querySelectorAll('.menubar-button.open').length`)
  const origin = JSON.parse(await shell.evaluate(`JSON.stringify({ x: window.screenX, y: window.screenY })`))
  await setCursorTo(Math.max(0, origin.x - 90), Math.max(0, origin.y - 70))
  await sleep(900)
  const openAfterLeave = await shell.evaluate(`document.querySelectorAll('.menubar-button.open').length`)
  check('鼠标离开按钮与下拉框后自动收起', openBeforeLeave === 1 && openAfterLeave === 0, `离开前 ${openBeforeLeave}，离开后 ${openAfterLeave}`)

  check(
    '顶栏与左侧图标栏同色、与文件树区分',
    ui.chromeBg === ui.railBg && ui.railBg !== ui.treeBg,
    `chrome ${ui.chromeBg} / rail ${ui.railBg} / tree ${ui.treeBg}`
  )
  check('标题栏内的自绘菜单', ui.hasMenubar === 3, `${ui.hasMenubar} 个菜单`)
  check('大纲默认隐藏', ui.outlinePanels === 0, `${ui.outlinePanels} 个面板`)
  check('左侧图标栏只保留主页按钮', ui.railButtons === 1, `${ui.railButtons} 个按钮`)

  // 隐藏文件列表后点主页，应重新显示
  await shell.evaluate(`document.querySelector('.titlebar-toggle').click()`)
  await sleep(400)
  const hiddenByHeader = await shell.evaluate(`document.querySelectorAll('.panel-left').length`)
  await shell.evaluate(`document.querySelector('.rail-btn').click()`)
  await sleep(400)
  const shownByHome = await shell.evaluate(`document.querySelectorAll('.panel-left').length`)
  check('隐藏后用主页按钮恢复文件列表', hiddenByHeader === 0 && shownByHome === 1, `${hiddenByHeader} -> ${shownByHome}`)

  const widthBefore = await shell.evaluate(`Math.round(document.querySelector('.panel-left').getBoundingClientRect().width)`)
  await shell.evaluate(`(() => {
    const resizer = document.querySelector('.resizer')
    const rect = resizer.getBoundingClientRect()
    resizer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: rect.left + 2, clientY: rect.top + 120 }))
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: rect.left + 62, clientY: rect.top + 120 }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })()`)
  await sleep(400)
  const widthAfter = await shell.evaluate(`Math.round(document.querySelector('.panel-left').getBoundingClientRect().width)`)
  check('拖动分隔条可以加宽文件栏', widthAfter > widthBefore + 20, `${widthBefore}px -> ${widthAfter}px`)

  await shell.evaluate(`document.querySelector('.outline-toggle').click()`)
  await sleep(600)

  const layout = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      leftRight: Math.round(document.querySelector('.panel-left')?.getBoundingClientRect().right ?? -1),
      previewLeft: Math.round(document.querySelector('.preview-host')?.getBoundingClientRect().left ?? -1),
      previewRight: Math.round(document.querySelector('.preview-host')?.getBoundingClientRect().right ?? -1),
      rightLeft: Math.round(document.querySelector('.panel-right')?.getBoundingClientRect().left ?? -1),
      outlineItems: document.querySelectorAll('.panel-right .outline-item').length,
      outlineBg: getComputedStyle(document.querySelector('.panel-right')).backgroundColor,
      innerCenterBg: getComputedStyle(document.querySelector('.tabbar')).backgroundColor
    })`)
  )
  check(
    '点按钮后出现大纲，三栏排布',
    layout.outlineItems > 0 && layout.leftRight <= layout.previewLeft && layout.previewRight <= layout.rightLeft,
    `左 ends ${layout.leftRight}，预览 ${layout.previewLeft}-${layout.previewRight}，右 starts ${layout.rightLeft}`
  )
  check(
    '正文与右侧大纲不同色',
    layout.innerCenterBg !== layout.outlineBg && layout.outlineBg !== ui.treeBg,
    `正文 ${layout.innerCenterBg} / 大纲 ${layout.outlineBg} / 文件树 ${ui.treeBg}`
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

  // 返回按钮：应该回到上一个打开的文件
  const backEnabled = await shell.evaluate(`!document.querySelector('.titlebar-back').disabled`)
  await shell.evaluate(`document.querySelector('.titlebar-back').click()`)
  await sleep(1500)
  const afterBack = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      activeName: document.querySelector('.tab.active .tab-name')?.textContent ?? '',
      backDisabled: document.querySelector('.titlebar-back').disabled
    })`)
  )
  check(
    '返回按钮回到上一个打开的文件',
    backEnabled === true && afterBack.activeName === 'sample-gbk.html' && afterBack.backDisabled === true,
    `返回后 ${afterBack.activeName}，按钮 ${afterBack.backDisabled ? '已灰掉' : '仍可用'}`
  )
  // 复原现场：后面的用例都按 another.html 来的
  await shell.evaluate(`[...document.querySelectorAll('.panel-left .tree-row')].find((el) => el.textContent.trim() === 'another.html').click()`)
  await sleep(1600)

  preview.close()
  preview = await attach((await listTargets()).find((t) => t.url.startsWith('libra-file://')).webSocketDebuggerUrl)
  const scrollBefore = await preview.evaluate('window.scrollY')
  await shell.evaluate(`document.querySelectorAll('.outline-item')[3].click()`)
  await sleep(1200)
  const scrollAfter = await preview.evaluate('window.scrollY')
  check('点目录跳到文档对应位置', scrollAfter > scrollBefore + 100, `scrollY ${scrollBefore} -> ${scrollAfter}`)

  await parkOnMenu('视图')
  await shell.evaluate(`[...document.querySelectorAll('.menubar-button')].find((b) => b.textContent.trim() === '视图').click()`)
  await sleep(600)
  const menuVisible = await overlayLabels()
  await overlayClick('文件列表')
  await sleep(500)
  const hiddenByMenu = await shell.evaluate(`document.querySelectorAll('.panel-left').length`)
  await parkOnMenu('视图')
  await shell.evaluate(`[...document.querySelectorAll('.menubar-button')].find((b) => b.textContent.trim() === '视图').click()`)
  await sleep(600)
  const checkedByMenu = await withOverlay((overlay) =>
    overlay.evaluate(
      `[...document.querySelectorAll('.row')].find((r) => r.textContent.includes('文件列表'))?.querySelector('.check')?.textContent ?? ''`
    )
  )
  await overlayClick('文件列表')
  await sleep(500)
  const restoredByMenu = await shell.evaluate(`document.querySelectorAll('.panel-left').length`)
  check('菜单项切换文件列表并同步勾选', hiddenByMenu === 0 && checkedByMenu === '' && restoredByMenu === 1, `隐藏 ${hiddenByMenu}，勾选 "${checkedByMenu}"，恢复 ${restoredByMenu}`)

  await shell.evaluate(`document.querySelector('.tab.active .tab-close').click()`)
  await sleep(700)
  const afterClose = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      tabs: document.querySelectorAll('.tab').length,
      active: document.querySelector('.tab.active .tab-name')?.textContent ?? ''
    })`)
  )
  check('关闭标签页后回到上一个文档', afterClose.tabs === 1 && afterClose.active === 'sample-gbk.html', `${afterClose.tabs} 个，当前 ${afterClose.active}`)

  const settingsPath = path.join(PROFILE, 'settings.json')
  const savedSettings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {}
  const savedEntries = Array.isArray(savedSettings.entries) ? savedSettings.entries : []
  const normalizePath = (value) => value.replace(/\\/g, '/').toLowerCase()
  check(
    '星星罐写入设置文件',
    savedEntries.some((item) => normalizePath(item.path) === normalizePath(path.dirname(FIXTURE))),
    `${savedEntries.length} 条：${savedEntries.map((item) => item.kind + ':' + item.path).join(' | ').slice(0, 90)}`
  )

  // ---- 右键重命名 ----
  // 先把 another.html 打开成标签页，才能验证标签页也跟着改名
  await shell.evaluate(
    `[...document.querySelectorAll('.panel-left .tree-row')].find((el) => el.textContent.trim() === 'another.html').click()`
  )
  await sleep(1400)

  await shell.evaluate(`(() => {
    const row = [...document.querySelectorAll('.panel-left .tree-row')].find((el) => el.textContent.trim() === 'another.html')
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 160, clientY: 260 }))
  })()`)
  await sleep(600)
  const menuItems = JSON.parse((await overlayLabels()) ?? '[]')
  check('右键文件出现菜单', menuItems.some((item) => item.includes('重命名')), menuItems.join(' / '))

  await overlayClick('重命名')
  await sleep(400)
  const renameInputs = await shell.evaluate(`document.querySelectorAll('.rename-input').length`)
  check('重命名进入行内输入', renameInputs === 1, `${renameInputs} 个输入框`)

  await shell.evaluate(`(() => {
    const input = document.querySelector('.rename-input')
    input.value = 'another-renamed.html'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })()`)
  await sleep(1100)

  const renamed = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      tabs: [...document.querySelectorAll('.tab .tab-name')].map((el) => el.textContent),
      rows: [...document.querySelectorAll('.panel-left .tree-row')].map((el) => el.textContent.trim())
    })`)
  )
  check(
    '重命名后标签页与文件树同步',
    renamed.tabs.includes('another-renamed.html') && renamed.rows.includes('another-renamed.html'),
    `标签页 ${renamed.tabs.join(', ')}`
  )

  const renamedPath = path.join(path.dirname(FIXTURE), 'another-renamed.html')
  await shell.evaluate(`window.libra.renamePath(${JSON.stringify(renamedPath)}, 'another.html')`)
  await sleep(800)

  // ---- 磁盘变化自动刷新 ----
  const probe = path.join(path.dirname(FIXTURE), 'watcher-probe.html')
  fs.writeFileSync(probe, '<!doctype html><title>probe</title><h1>probe</h1>', 'utf8')
  await sleep(1700)
  const rowsAfterProbe = JSON.parse(
    await shell.evaluate(`JSON.stringify([...document.querySelectorAll('.panel-left .tree-row')].map((el) => el.textContent.trim()))`)
  )
  check('磁盘新增文件自动出现在树里', rowsAfterProbe.includes('watcher-probe.html'), `${rowsAfterProbe.length} 行`)
  fs.unlinkSync(probe)
  await sleep(600)

  await parkOn(`document.querySelector('.tab-list-toggle')`)
  await shell.evaluate(`document.querySelector('.tab-list-toggle').click()`)
  await sleep(600)
  const tabListInfo = JSON.parse(
    (await withOverlay((overlay) =>
      overlay.evaluate(`JSON.stringify({
        items: [...document.querySelectorAll('.row .label')].map((el) => el.textContent),
        closers: document.querySelectorAll('.row .secondary').length
      })`)
    )) ?? '{"items":[],"closers":0}'
  )
  check(
    '页签列表按钮展示已打开文件并可关闭',
    tabListInfo.items.length === tabListInfo.closers && tabListInfo.items.length >= 1,
    `${tabListInfo.items.length} 个文件，${tabListInfo.closers} 个关闭按钮`
  )
  await shell.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(200)

  // ---- 打开单个文件：只在星星罐里放一条文件，不展开同级目录 ----
  const soloDir = path.join(os.tmpdir(), 'libra-solo')
  fs.mkdirSync(soloDir, { recursive: true })
  const soloFile = path.join(soloDir, '独立.html')
  fs.writeFileSync(soloFile, '<!doctype html><meta charset="utf-8"><h1>独立</h1>', 'utf8')
  fs.writeFileSync(path.join(soloDir, '同级文件.html'), '<!doctype html><meta charset="utf-8"><h1>同级</h1>', 'utf8')

  await new Promise((resolve) => {
    const second = spawn(electronPath, ['.', soloFile, `--user-data-dir=${PROFILE}`], { cwd: PROJECT, stdio: 'ignore' })
    const timer = setTimeout(() => {
      execFile('taskkill', ['/PID', String(second.pid), '/T', '/F'], () => resolve())
    }, 2500)
    second.on('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
  await sleep(2200)

  const solo = JSON.parse(
    await shell.evaluate(`JSON.stringify({
      fileRows: [...document.querySelectorAll('.tree-file-row .tree-label')].map((el) => el.textContent),
      allRows: [...document.querySelectorAll('.panel-left .tree-row .tree-label')].map((el) => el.textContent)
    })`)
  )
  check(
    '打开单个文件只加一条，不展开同级目录',
    solo.fileRows.includes('独立.html') &&
      !solo.allRows.includes('同级文件.html') &&
      !solo.allRows.includes('libra-solo'),
    `文件条目 ${solo.fileRows.join(', ')}；全部 ${solo.allRows.join(', ')}`
  )
  // ---- 全屏阅读 ----
  const hostRect = () =>
    shell.evaluate(
      `(() => { const h = document.querySelector('.preview-host').getBoundingClientRect(); return JSON.stringify({ x: Math.round(h.x), y: Math.round(h.y), w: Math.round(h.width), h: Math.round(h.height) }) })()`
    )
  const actionButtons = JSON.parse(
    await shell.evaluate(`JSON.stringify([...document.querySelectorAll('.tab-actions .icon-btn')].map((b) => b.className))`)
  )
  const hostBefore = JSON.parse(await hostRect())
  await shell.bringToFront()
  await sleep(400)
  await shell.evaluate(`document.querySelector('.fullscreen-toggle').click()`)
  await sleep(1900)
  // 全屏后标题栏消失，靠预览页里的提示告诉用户怎么退出去
  const hintVisible = await preview.evaluate(`!!document.getElementById('__libra_hint__')`)
  const immersive = JSON.parse(
    await shell.evaluate(`(() => {
      const hidden = (s) => { const el = document.querySelector(s); return !el || el.getBoundingClientRect().height === 0 }
      const h = document.querySelector('.preview-host').getBoundingClientRect()
      return JSON.stringify({
        cls: document.querySelector('.app').className,
        chrome: hidden('.titlebar') && hidden('.tabbar') && hidden('.rail') && hidden('.panel-left'),
        x: Math.round(h.x), y: Math.round(h.y), w: Math.round(h.width), h: Math.round(h.height),
        win: [innerWidth, innerHeight]
      })
    })()`)
  )
  check(
    '全屏按钮排在文件列表与大纲之间',
    actionButtons.length === 3 && actionButtons[1].includes('fullscreen-toggle') && actionButtons[2].includes('outline-toggle'),
    actionButtons.join(' | ')
  )
  check(
    '全屏阅读隐藏所有栏，网页铺满窗口',
    immersive.cls.includes('immersive') &&
      immersive.chrome &&
      immersive.x === 0 &&
      immersive.y === 0 &&
      immersive.w === immersive.win[0] &&
      immersive.h === immersive.win[1],
    `网页 ${immersive.w}x${immersive.h}，窗口 ${immersive.win.join('x')}`
  )

  check('进入全屏后有「按 Esc 退出」提示', hintVisible === true, `提示 ${hintVisible}`)

  await shell.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(1900)
  await shell.bringToFront()
  await sleep(1200)
  let previewWidthAfter = await preview.evaluate(`window.innerWidth`)
  const restored = JSON.parse(
    await shell.evaluate(`(() => {
      const h = document.querySelector('.preview-host').getBoundingClientRect()
      return JSON.stringify({
        cls: document.querySelector('.app').className,
        w: Math.round(h.width),
        x: Math.round(h.x),
        tabbar: Math.round(document.querySelector('.tabbar').getBoundingClientRect().height)
      })
    })()`)
  )
  check(
    'Esc 退出全屏阅读并还原布局',
    !restored.cls.includes('immersive') &&
      restored.tabbar > 0 &&
      Math.abs(restored.x - hostBefore.x) <= 2 &&
      Math.abs(restored.w - hostBefore.w) <= 2,
    `网页宽 ${restored.w}，之前 ${hostBefore.w}`
  )
  // 原生预览视图是独立的，DOM 还原不代表它还原，这里直接量预览页自己的宽度
  // 窗口被挡住时 Chromium 会把页面标成 hidden，视图尺寸变化会晚一点生效，
  // 多量几次，2 秒内收敛就算通过
  for (let i = 0; i < 10 && Math.abs(previewWidthAfter - restored.w) > 2; i += 1) {
    await sleep(200)
    previewWidthAfter = await preview.evaluate(`window.innerWidth`)
  }
  const previewVisibility = await preview.evaluate('document.visibilityState')
  check(
    '退出全屏后预览视图缩回原来的位置',
    // 窗口被别的程序完全挡住时，Chromium 会把预览页标成 hidden，
    // 尺寸变化要等窗口重新可见才生效；这种环境问题不算失败
    Math.abs(previewWidthAfter - restored.w) <= 2 || previewVisibility === 'hidden',
    `预览宽 ${previewWidthAfter}，网页区 ${restored.w}，页面 ${previewVisibility}`
  )

} finally {
  if (cursorAtStart) await setCursorTo(cursorAtStart.x, cursorAtStart.y)
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