import fs from 'node:fs'
import iconv from 'iconv-lite'

const dir = 'E:/Libra/libra/test/fixtures'
fs.mkdirSync(dir, { recursive: true })

const gbk = '<!doctype html>\r\n<html lang="zh-CN">\r\n  <head><meta charset="gbk"><title>示例</title></head>\r\n  <body>\r\n    <h1>中文标题</h1>\r\n    <p>这一行用来验证 GBK 编码与 CRLF 换行。</p>\r\n  </body>\r\n</html>\r\n'
fs.writeFileSync(`${dir}/sample-gbk.html`, iconv.encode(gbk, 'gbk'))

const second = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <title>第二个文件</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 40px; }
      h1 { color: #a9743f; }
    </style>
  </head>
  <body>
    <h1>第二个 HTML 文件</h1>
    <p>用于验证左侧文件列表可以切换。</p>
  </body>
</html>
`
fs.writeFileSync(`${dir}/another.html`, second, 'utf8')

console.log('fixtures ready:', fs.readdirSync(dir).join(', '))