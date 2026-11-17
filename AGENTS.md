# AGENTS.md

Libra 是一个 Electron 桌面应用：打开本地 HTML 文件，像浏览器一样读，像编辑器一样改几个字，保存后文件不能被改坏。

任何改动都必须服从下面的铁律。与铁律冲突的方案，先改铁律（走 ADR 讨论），再写代码。

## 铁律

1. **文本即真相。** 文件文本是唯一可编辑状态。不引入 DOM 树、块树、JSON 文档模型作为编辑目标。
2. **不做整页 WYSIWYG。** 永不实现"渲染后的页面被编辑 → 自动回写源码"。唯一允许的富交互是点选式微观编辑：预览里选中一段 → 映射回源码区间 → 就地修改。
3. **预览必须隔离。** 用户 HTML 跑在独立进程 + 独立 origin：WebContentsView + 自定义协议 + `sandbox: true` + `nodeIntegration: false` + 独立 partition。禁止把不可信 HTML 插进主窗口 DOM。
4. **保存保真。** 保留原编码（含 BOM）、原换行符（CRLF/LF）；未编辑的字节不变。写入用临时文件 + `rename` 原子替换。
5. **不自动改格式。** 格式化只在用户显式点击时执行，且是一次可撤销的编辑。
6. **渲染进程无系统权限。** renderer 不得直接使用 fs / child_process / shell。所有文件操作在 main 进程，经 `contextBridge` 暴露窄接口，IPC 入参必须校验（绝对路径 + 扩展名白名单）。
7. **依赖先议后加。** 新增运行时依赖要说明理由；影响架构的（编辑器内核、渲染方案、打包器）必须先写 ADR。

## 产品形态

- 打开文件默认进入**阅读模式**：看到的是渲染结果，不是源码。源码是第二视图，Ctrl+E 切换。
- 左侧固定展示当前文件所在目录的 HTML 列表，用于在文档之间切换。
- 配色为浅色纸感（护眼优先），不做深色主题。

## 已否决（别再提）

| 方案 | 否决原因 |
| --- | --- |
| iframe `srcdoc` 做预览隔离 | 同源，脚本能访问父页面，已有绕过案例 |
| `contenteditable` 整页编辑 | 渲染后无法无损回写，必然丢格式/注释 |
| 保存时统一转成 UTF-8 / LF | 直接毁掉 GBK 与 CRLF 文件 |
| 用 DOM 序列化结果覆盖源文件 | 序列化器会重排属性、改写实体、丢掉原始空白 |

## 技术栈（已定）

Electron 33+ · TypeScript · electron-vite · React · CodeMirror 6
parse5（预览↔源码定位）· chardet + iconv-lite（编码）· electron-store（会话）· electron-builder（打包）

## 目录

```
src/main/       主进程：窗口、菜单、文件 IO、预览进程管理
src/preload/    contextBridge 桥接层（唯一的权限出口）
src/renderer/   编辑器 UI（CodeMirror 6）
src/preview/    预览页（M1 落地；沙箱内运行，注入定位脚本）
docs/           架构与决策文档
```

## 命令

npm run dev      开发模式
npm run build    类型检查 + 构建
npm test         编码与换行保真测试
npm run smoke    启动真实应用，打开样本、保存、比对字节

## 动手之前先读

- `docs/architecture.md`：设计取舍、同类产品对比、风险清单
- 涉及预览安全、编码处理、打包分发时，先读对应章节再动手

## 完成标准

一个功能算完成，需要同时满足：能跑起来 → 手动走通一次完整闭环 → 保存后的文件用 `git diff` 确认只有预期字节变化。

## 边界

- 不为"看起来更完整"而扩大范围，范围变更先讨论。
- 发现需求与铁律冲突，先指出冲突，不要默默实现。