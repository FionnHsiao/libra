# AGENTS.md

Libra 是一个只读的本地 HTML 阅读器：打开文件夹或单个 HTML，按浏览器渲染的结果读，不改写磁盘上的内容。

## 铁律

1. **只读。** 唯一会改磁盘的操作是用户主动重命名文件或文件夹。
2. **预览必须隔离。** 用户 HTML 跑在独立的 WebContentsView 里：自定义协议 + `sandbox: true` + `nodeIntegration: false` + 独立 partition。禁止把不可信 HTML 插进主窗口 DOM。
3. **渲染进程无系统权限。** renderer 不得直接用 fs / child_process / shell；所有文件操作在 main，经 `contextBridge` 暴露窄接口，IPC 入参必须校验（绝对路径 + 扩展名白名单）。
4. **弹层用独立视图。** 原生预览永远盖在网页之上，DOM 做不出真正的浮层；菜单、右键菜单、页签列表都渲染在 overlay 视图里。
5. **依赖先议后加。** 新增运行时依赖要说明理由；影响架构的（渲染方案、打包器）先写 ADR。

## 产品形态

- 三栏：左侧文件树（可折叠、多根目录）、中间正文（页签）、右侧大纲（从渲染后的 h1–h6 提取）。
- 左右两栏独立开关，分隔条可拖；正文和两侧栏之间不留缝。
- 浅色纸感配色，不做深色主题。
- 全屏阅读：隐藏标题栏、图标栏、文件树、页签和大纲，窗口同时全屏；F11 / ⌃⌘F 切换，Esc 退出并还原进入前的窗口状态。
- 返回按钮回到上一个打开过的文件；顶部没有第二条 logo。
- 菜单悬停即切换，鼠标离开「触发按钮 + 下拉框」自动收起。

## 已否决

| 方案 | 原因 |
| --- | --- |
| iframe `srcdoc` 做预览隔离 | 同源，页面脚本能访问父窗口 |
| `contenteditable` 整页编辑 | 渲染结果无法无损回写，必然丢格式和注释 |
| 用 DOM 序列化结果覆盖源文件 | 序列化器会重排属性、改写实体、丢空白 |
| 圆形图标 | 圆角方形更稳，已定稿 |

## 技术栈

Electron 33 · TypeScript · electron-vite · React · chardet + iconv-lite（编码识别）· electron-builder（打包）

## 目录

```
src/main/       主进程：窗口、菜单、文件 IO、预览视图、弹层视图、磁盘监听
src/preload/    contextBridge 桥接层（唯一的权限出口）
src/renderer/   界面：标题栏、文件树、页签、大纲；overlay/ 是弹层页面
src/shared/     主进程与渲染进程共享的类型和通道名
```

## 命令

```
npm run dev      开发模式
npm run build    类型检查 + 构建
npm test         编码与路径的单元测试
npm run smoke    启动真实应用跑端到端检查
npm run dist:win Windows 安装包
npm run dist:mac macOS dmg + zip（必须在 macOS 上跑）
```

## 完成标准

能跑起来 → 手动走通一次完整流程 → `npm run typecheck && npm test && npm run smoke` 全绿。
