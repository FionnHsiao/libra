# 架构

只读 HTML 阅读器。用户打开的 HTML 来自任意地方，可能带脚本，所以「显示别人的网页」这件事在安全上必须先解决。

## 进程分工

| 位置 | 职责 |
| --- | --- |
| `src/main` | 窗口、菜单、文件 IO、磁盘监听、预览视图和弹层视图的生命周期 |
| `src/preload` | 唯一的权限出口，`contextBridge` 暴露窄接口 |
| `src/renderer` | 标题栏、文件树、页签、大纲；`overlay/` 是弹层页面 |
| 预览视图 | 独立 `WebContentsView`，跑用户的 HTML |

## 预览隔离

用户 HTML 不在主窗口的 DOM 里，而是放在单独的 `WebContentsView`：

- 独立 partition（`persist:libra-preview`），和主界面不共享存储与 Cookie
- `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、`webviewTag: false`
- 用自定义协议 `libra-file://` 提供文件；`allowRoot()` 只放行打开文件所在目录及其子路径，路径必须落在已授权根目录里
- 页面里的外链一律 `shell.openExternal`，不允许在应用内导航
- 主窗口到预览只发三类消息：加载、滚动到某个标题、显示一条提示

代价是预览是原生视图，永远画在网页内容之上。所以弹层（顶部菜单、右键菜单、页签列表）也只能是原生视图，见 `src/main/overlay.ts`：一个透明的小 `WebContentsView`，由渲染进程传入锚点矩形定位，鼠标离开「触发按钮 + 下拉框」就收起。

## 布局与全屏

渲染进程只负责告诉主进程「预览应该占哪块矩形」，主进程再 `setBounds`。分隔条拖动、侧栏开关、窗口缩放都走这一条路。

全屏阅读时界面全部隐藏、窗口进系统全屏。系统全屏的进出是异步的，过渡期间 ResizeObserver 可能一次都不回调，所以主进程在 `leave-full-screen` 和 280ms 后各让渲染进程补报一次尺寸（`PreviewPane` 进入过渡期后还会轮询 1.5 秒）。

## 文件与编码

- 打开前校验：绝对路径、扩展名白名单、存在性
- 磁盘监听：`fs.watch` 监视星星罐里的根目录，300ms 防抖后通知渲染进程
- 编码：BOM 优先，其次严格 UTF-8，再交给 chardet + iconv-lite 猜 GBK 等；解码结果直接给预览协议用字节回吐，不做转码
- 星星罐内容保存在 `userData/settings.json`

## 已知限制

- 不做内容编辑，也不写回文件
- 大纲不随滚动高亮当前章节
- 切换页签不恢复滚动位置
- 打包没有签名，macOS 首次打开要右键 → 打开
