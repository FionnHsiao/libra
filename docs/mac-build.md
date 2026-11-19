# macOS 打包

## 只能在 macOS 上打

electron-builder 在别的系统上会直接拒绝：

```
Build for macOS is supported only on macOS
```

dmg 依赖 macOS 的 `hdiutil`，Windows 和 Linux 上没有替代品，所以不能在本机出 mac 包。

## 没有 Mac：用 GitHub Actions

`.github/workflows/build.yml` 里已经有 `macos-latest` job，公开仓库不额外收费。

1. 改 `package.json` 的 `version`
2. 推 tag：`git tag v0.1.2` 然后 `git push origin v0.1.2`
3. Actions 跑完，在对应 run 页面下载 Artifacts 里的 `libra-macos`
4. 解压后是 `Libra-<version>-x64.dmg`、`Libra-<version>-arm64.dmg` 和两个对应的 zip

也可以在 Actions 页面手动 Run workflow，但需要在仓库设置里允许，且 token 要带 workflow 权限。

CI 里用的是 `--publish never`，只出包不碰 Release。要让它自动上传，得配上 `GH_TOKEN` 再改成 `--publish always`。

## 未签名的影响

构建日志里会出现：

```
skipped macOS application code signing
```

别人第一次打开会被 Gatekeeper 拦住，有两条路：

- 系统设置 → 隐私与安全性 → 仍要打开
- 或者 `xattr -cr /Applications/Libra.app`

想彻底免掉这一步，需要 Apple Developer Program（$99/年）：Developer ID Application 证书 + notarytool 公证，CI 里配 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`。

## 其它办法

- 租云 Mac：MacStadium、AWS EC2 mac 实例、Scaleway 的 Apple silicon 机器。按小时计费，多数有 24 小时起租，适合需要看界面的调试。
- 借一台 Mac：`npm ci` 之后 `npm run dist:mac`，产物在 `dist/`。
- 在虚拟机里装 macOS：Apple 的授权只允许 macOS 跑在 Apple 硬件上，不合规，不建议。
