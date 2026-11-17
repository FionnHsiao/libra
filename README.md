# Libra

桌面端的 HTML 阅读器 + 轻编辑器。打开本地 HTML，读它、改它、保存它 —— 文件不被改坏。

## 现在能做什么（M0）

- 打开 / 拖入 / 通过文件关联双击 `.html`，语法高亮显示
- 编辑后保存，**保持原编码**（UTF-8、UTF-16、GBK / GB18030）与**原换行符**（CRLF / LF）
- 原子写入（临时文件 + rename），不会写出半个文件
- 有未保存修改时关闭窗口会询问
- 状态栏显示编码、换行、光标位置、文件大小

## 还不能做什么

- 渲染预览（M1，独立进程 + 独立 origin 的沙箱预览）
- 源码 ↔ 预览定位、阅读模式、导出 PDF、安装包

## 快速开始

双击项目根目录的 **`启动Libra.cmd`** 即可。首次运行会自动安装依赖，之后每次双击都以开发模式启动，直接运行仓库里最新的代码。

## 开发

```bash
npm install
npm run dev
npm run build
npm test
npm run smoke
```

`npm run dev` 开发模式；`npm run build` 类型检查 + 构建；`npm run smoke` 会启动真实应用，打开一个 GBK + CRLF 的样本文件，保存后比对字节是否完全一致。

如果 `npm install` 之后启动报 `Electron failed to install correctly`，说明 Electron 二进制没解压成功，重新执行下面这行：

```bash
node node_modules/electron/install.js
```

## 设计

- [AGENTS.md](AGENTS.md)：工程铁律（文本即真相、不做整页所见即所得、预览必须隔离、保存必须保真）
- [docs/architecture.md](docs/architecture.md)：技术调研、同类产品对比、风险清单

## License

TBD