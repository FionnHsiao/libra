# Libra 技术调研与架构方案

> 定位：Electron 桌面应用，能像阅读器一样打开 HTML，能做**简单编辑**，并且尽量不破坏原文件。
> 本文回答三件事：别人是怎么做的、Libra 该选哪条路、具体怎么落地。

---

## 1. 结论先行

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 真相源 | **文件文本**（不是 DOM，不是文档树） | HTML 可以任意复杂、任意丑陋；只有"原文即真相"才能保证打开什么就保存什么 |
| 编辑器内核 | **CodeMirror 6** | 虚拟滚动、增量解析、扩展生态（装饰/widget），Obsidian 同款 |
| 预览 | **独立进程 + 独立 origin 渲染**（WebContentsView + 自定义协议） | 用户打开的 HTML 可能带脚本，不能进主窗口 DOM |
| WYSIWYG | **渐进增强**，不做全量双向同步 | 任意 HTML 的 DOM↔源码映射是"有损"的，项目会陷进去 |
| 打包 | electron-builder（NSIS）+ 文件关联 | 双击 .html 直接用 Libra 打开，是这个产品成立的前提 |

一句话版本：**用 Typora 的「单栏、文本即真相、视图只是装饰」思想，套在 CodeMirror 6 + 沙箱预览上。**

---

## 2. 市面产品拆解

### 2.1 Typora —— 最该学的形态

- 技术栈是 Electron（Chromium + Node），所以主题、CSS、插件都是前端可改的，社区插件（如 `typora_plugin`）正是靠这一点注入实现。
- 交互形态：**单栏、所见即所得**，没有"左边源码右边预览"的分裂。
- 关键机制（推断自其行为 + 公开分析）：Markdown 文本是真相源；编辑器把文档切成**块**，非活动块渲染成 DOM（真正排版好的样子），光标进入某块时才显示该块源码标记。
- 提供 **Source Mode** 一键切纯源码，用于排查"脏字符"或整段粘贴。
- 对 Libra 的启发：
  1. 单栏 + 内联渲染，比双栏更像"阅读器"；
  2. 永远保留纯源码兜底视图，装饰出错时能救命；
  3. 但它能做块级 WYSIWYG，是因为 **Markdown 的块边界是语法显式定义的**——这个前提在 HTML 上不成立（见 §3）。

### 2.2 Obsidian —— 最该学的工程做法

- 同样是 Electron；文件就是磁盘上的 Markdown，App 只是"视图层"，这一点和 Libra 想做的事高度一致。
- 编辑器是 **CodeMirror 6**。所谓 Live Preview 并不是另一套富文本引擎，而是**用 CM6 的 decoration / widget 把标记符号隐藏、把表格/图片/数学公式替换成可视组件**；光标进入范围时再展开。
- 好处：文档始终是纯文本，不存在"渲染后回写"的丢失问题；坏处：所有"富"效果都要手写扩展（这是个持续投入的活）。
- 插件生态、主题、命令面板，是它长期活下来的关键。
- 社区里已有把 CM6 做成 Obsidian 式 live preview 的独立实现（如 atomic-editor、codemirror-live-markdown），可以直接读源码借鉴。

### 2.3 Mark Text / Muya —— 反面教材 + 局部参考

- Muya 走的是**文档树路线**：`ot-json1` 存一棵块树，`contenteditable` 只当渲染目标，用自研 lexer + snabbdom 虚拟 DOM 增量更新，插入删除都是 OT 操作。
- 这条路能做协作、能做块级拖拽，但代价是 **schema 有损**：Markdown 进来被解析成块树，再序列化出去，格式/空行/怪异写法会被"规范化"。
- 对 Libra 的意义：**HTML 走这条路会更糟**——HTML 的 schema 比 Markdown 大一个数量级，随便一个 `<div style="...">` 都可能不是合法节点。
- 值得偷的点：块级 widget 的渲染思路、虚拟 DOM 增量更新（预览 diff 也能用）。

### 2.4 Joplin / Zettlr —— 双栏派的可靠性

- 左边源码、右边预览，中间靠 debounce 同步。实现成本最低、心智最清晰，缺点是"阅读"和"编辑"两套布局来回切。
- 适合作为 Libra 的**第二形态**（可切换的双栏模式），但不应是唯一形态。

### 2.5 VS Code —— 该学的安全模型

- 桌面端 webview 本质是 Electron 的 `<webview>` / iframe，但它给了**独立 origin + 进程沙箱 + 自定义协议**（`vscode-webview://`），扩展里的任意 HTML 都跑在这个笼子里，靠 `postMessage` 和宿主通信。
- 2022 年官方把整个 VS Code 迁移到进程沙箱，核心手段就是：自定义协议当 HTTPS 对待 + 渲染进程 `sandbox: true`。
- Libra 要"安全地显示别人的 HTML"，这套模型几乎是唯一正确答案。

### 2.6 横向对比

| 产品 | 真相源 | 编辑器 | 呈现 | 关键取舍 |
| --- | --- | --- | --- | --- |
| Typora | Markdown 文本 | 自研块级引擎 | 内联 WYSIWYG + 源码模式 | 体验最好，但依赖"语法可逆" |
| Obsidian | Markdown 文件 | CodeMirror 6 + 装饰 | 内联 Live Preview / 源码 | 文本为真相，最稳，扩展工作量大 |
| Mark Text | 块树 (ot-json1) | contenteditable + VDOM | 内联 + 双栏 | 可协作，但格式有损 |
| Joplin | Markdown 文件 | CodeMirror（新版 6） | 双栏 | 简单可靠 |
| VS Code | 文本 | Monaco | 沙箱 webview | 安全模型最值得抄 |
| **Libra** | **HTML 文本** | **CodeMirror 6** | **隔离预览 + 源码编辑** | 先保证"不破坏文件"，再渐进加体验 |

---

## 3. 三种编辑架构，以及 HTML 为什么不走第 2、3 条

| 范式 | 真相源 | 优点 | 致命问题（对 HTML） |
| --- | --- | --- | --- |
| A. 源码为中心 | 文件文本 | 零损耗、任意文件都能开、成本最低 | 不是 WYSIWYG |
| B. 块级 WYSIWYG（Typora 式） | 文本 + 块渲染 | 单栏体验极佳 | 需要"块边界"和"渲染→源码"可逆映射；HTML 靠标签嵌套，边界不确定，回写必然错位 |
| C. 文档树为中心（ProseMirror / Muya 式） | 结构化树 | 真富文本、可协作 | schema 有损：打开任意 HTML 会被规范化/丢元素，违背"阅读器"基本承诺 |

### Libra 的选择：A 为主，B 做"局部降级版"，C 永远不做

具体说：

- **默认**：CodeMirror 6 源码编辑 + 右侧隔离预览（双栏）。HTML 这种"结构 + 样式 + 脚本"混在一起的东西，源码才是唯一可靠的表示。
- **阅读模式**：整屏预览，编辑入口收起，像浏览器一样读。这是"阅读器"的主形态。
- **局部 WYSIWYG（后期）**：不做整页双向同步，只做**点选式微观编辑**——在预览里双击一段文字，通过预埋的行号/偏移定位到源码区间，弹出轻量输入框改完写回。范围小、可逆、不会污染全文档。
- **绝不做**：整页 DOM ↔ 源码实时同步（这是所有 HTML 编辑器的坟场）。

---

## 4. 落地架构

### 4.1 技术栈

```
Electron 33+ / TypeScript / Vite (electron-vite)
├─ 主进程     文件读写、对话框、菜单、窗口、预览进程管理
├─ 渲染进程   React（或纯 TS）+ CodeMirror 6
└─ 预览进程   独立 WebContentsView，沙箱 + 自定义协议
```

- UI 框架用 React 即可（生态、组件库多）；不想引入也可纯 TS + 少量 DOM 操作，CM6 本身与框架无关。
- 状态管理：Zustand 或简单的 store，够用。

### 4.2 进程与安全模型（必须一开始就定死）

```js
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,   // 默认值，显式写出来
    sandbox: true,
    nodeIntegration: false,
    webviewTag: false
  }
})
```

- **所有文件 IO 在 main 进程**；renderer 只拿到极窄 API：

```ts
// preload 暴露（contextBridge）
window.libra = {
  openFile(): Promise<{ path: string; text: string; encoding: string; eol: 'LF'|'CRLF' }>
  saveFile(path: string, text: string): Promise<void>
  saveFileAs(...): Promise<string | null>
  watchFile(path: string, cb: (evt) => void): () => void
  exportPdf(path: string, outPath: string): Promise<void>
}
```

- IPC 入参**逐个校验**：绝对路径、扩展名白名单（`.html/.htm/.xhtml/.css/.js`）、长度上限；绝不把 renderer 传来的字符串拼进 shell。
- `will-navigate` / `setWindowOpenHandler` 全部拦截，外链走 `shell.openExternal`。
- 渲染进程设 CSP：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`（CM6 需要 inline style）。

### 4.3 预览隔离（这是最容易翻车的地方）

- **不要**用 iframe `srcdoc` 直接渲染不可信 HTML——同源，脚本能摸到父页面；已有安全研究证明这种"看起来安全"的写法会被绕过。
- 推荐做法：

```
预览 = new WebContentsView({ webPreferences: {
  partition: 'persist:libra-preview',   // 与主窗口隔离
  sandbox: true, nodeIntegration: false, contextIsolation: true,
  preload: previewPreload.js           // 只暴露 onScroll / jumpTo / elementAt
}})
```

- 资源加载：注册自定义协议，把**文件所在目录**映射成 `libra-preview://` 的根，这样 `<img src="./a.png">`、`./style.css` 都能正常加载，同时拥有独立 origin。
- 用户 HTML 里的 `<script>` 默认**允许执行**（否则很多页面打不开），但跑在沙箱里、拿不到 Node、拿不到宿主 API。
- 若用户想彻底静态化阅读，提供「禁用脚本」开关（预览进程级别关 JS）。

### 4.4 源码 ↔ 预览双向定位（小功能，大体验）

1. 渲染前用 `parse5` 解析，给元素打 `data-libra-offset`（源码起始偏移）。
2. 预览里点击某元素 → 通过 preview preload 回传 offset → 主窗口 `view.dispatch` 跳转并选中。
3. 反向：编辑器光标所在偏移 → 找最近的 `data-libra-offset` 元素 → 预览 `scrollIntoView`。

这一步做完，"阅读器"和"编辑器"才是一个东西，而不是两个面板。Typora 的顺滑感很大程度来自这种位置一致性。

### 4.5 文件层（决定"专业感"的细节）

| 问题 | 做法 |
| --- | --- |
| 编码 | `jschardet` 检测；UTF-8 / GBK / GB18030 用 `iconv-lite` 解码；保存时**保持原编码 + 原 BOM** |
| 换行 | 记录源文件是 CRLF 还是 LF，保存时原样写回 |
| 原子写 | 写 `.tmp` → `fs.rename`，防断电写坏 |
| 外部修改 | `chokidar` 监听 + mtime/hash 比对；冲突时给「重新加载 / 覆盖 / 对比」三选 |
| 自动保存 | 默认"失焦保存"（Typora 式），可改实时/关闭 |
| 会话 | `electron-store` 存窗口尺寸、打开的 tab、最近文件、阅读位置 |
| 拖拽 | Electron 32 起 `File.path` 已移除，用 `webUtils.getPathForFile(file)` |

编码和换行这两条看着不起眼，但中文用户的 HTML 里 GBK 文件极多，处理不好就是"打开即损坏"。

### 4.6 编辑能力清单（"简单编辑"的具体边界）

必备（M1–M2）：
- 语法高亮（嵌套 CSS/JS）、自动闭合标签、标签名补全
- Emmet（写 HTML 的效率命脉）
- 查找替换（支持正则）、跳转行
- 一键格式化（Prettier，**只在用户主动点击时**执行）
- 缩进/注释/包裹标签、多光标
- 图片粘贴：base64 内联 或 存到同级 `assets/`（可配置）
- 大纲（h1–h6 树）、阅读模式、导出 PDF（`printToPDF`）

加分（M3+）：
- 表格浮层编辑器（CM6 widget 渲染可视化表格，回写 tbody）
- 双击预览改文字/属性
- 保存为自包含 HTML（内联 CSS、图片转 data URI）
- 文件树 / 目录浏览（如果要做成"资料库"而不仅是单文件阅读器）

### 4.7 性能

- CM6 本身虚拟滚动，几 MB 的 HTML 能开；>5 MB 自动降级为"纯文本 + 弱高亮"并提示。
- 预览更新：结构变化小 → `morphdom` 做 DOM diff（保住滚动和焦点）；变化大 → 整页 reload（保住滚动比例）。
- 语法解析是增量的，但要避免每次输入都全量 parse5 重新打标记——只在"保存/闲置 500ms"时做一次。

### 4.8 打包与文件关联

- `electron-builder` + NSIS；`fileAssociations` 在 Windows 上**只有 NSIS 目标生效**。
- 单实例锁 + `second-instance` 读 `process.argv` 拿文件路径；macOS 走 `open-file` 事件。
- 可选：便携版 zip（免安装），对工具类产品很讨喜。
- 代码签名先跳过，用户量起来再说（Windows 上会弹 SmartScreen）。

---

## 5. 里程碑

| 阶段 | 内容 | 交付感 |
| --- | --- | --- |
| **M0** | Electron + Vite + TS 骨架；打开/保存 HTML；CM6 高亮；原生菜单 | 能改字并保存，不坏文件 |
| **M1** | 隔离预览 + 双向定位 + 编码/换行保持 + 最近文件 + 拖拽打开 | 像阅读器了 |
| **M2** | Emmet、格式化、查找替换、图片粘贴、失焦自动保存、外部改动检测 | 能日常用 |
| **M3** | 阅读模式（全屏 + 大纲 + 主题）、导出 PDF、文件关联与安装包 | 可以发给别人 |
| **M4** | 局部 WYSIWYG（双击改文字）、表格浮层、书签 | 有记忆点 |

---

## 6. 风险清单

1. **想做成"整页所见即所得"** → 一定会陷入 DOM↔源码同步，最后连保存都不敢点。守住 A 范式。
2. **预览安全** → 用户 HTML 里的脚本 + Electron 的 Node 能力是 RCE 组合，沙箱/独立 origin 必须第一天就做对。
3. **编码/换行** → 不做检测就会毁文件，属于"一次事故就流失用户"的级别。
4. **大文件** → 几万行 HTML 的解析和预览会卡，需要明确降级策略。
5. **范围膨胀** → 一旦加了"资料库/双链/插件"，就变成第二个 Obsidian。先做"单文件读得爽、改得稳"。

---

## 7. 参考

- Typora 技术栈与形态：Typora 基于 Electron 构建（百度百科、社区插件实现方式可佐证）
- Obsidian 编辑器为 CodeMirror 6，Live Preview 依赖 decorations/widgets：`sinja.io` Obsidian 插件开发笔记、`deepwiki` Obsidian 架构概览、`atomic-editor` / `codemirror-live-markdown` 开源实现
- Mark Text / Muya 架构（块树 + ot-json1 + snabbdom + contenteditable）：`github.com/marktext/muya`
- VS Code webview 安全模型与进程沙箱：VS Code 官方博客《Migrating VS Code to Process Sandboxing》、《Webview API》
- iframe srcdoc 预览的安全陷阱：`blog.master.dev`《Building an Isolated Preview for AI-Generated HTML》
- Electron 安全清单：Electron 官方文档 Security
- `webUtils.getPathForFile`：Electron 文档（32 起替代 `File.path`）
- 文件关联：electron-builder `fileAssociations` 文档 + NSIS 配置