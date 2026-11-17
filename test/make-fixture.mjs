import fs from 'node:fs'
import iconv from 'iconv-lite'

const dir = 'E:/Libra/libra/test/fixtures'
fs.mkdirSync(dir, { recursive: true })

const gbk = '<!doctype html>\r\n<html lang="zh-CN">\r\n  <head><meta charset="gbk"><title>示例</title></head>\r\n  <body>\r\n    <h1>中文标题</h1>\r\n    <p>这一行用来验证 GBK 编码与 CRLF 换行。</p>\r\n  </body>\r\n</html>\r\n'
fs.writeFileSync(`${dir}/sample-gbk.html`, iconv.encode(gbk, 'gbk'))

const filler = Array.from({ length: 12 }, (_, i) => `      <p>这是第 ${i + 1} 段占位文本，用来让页面足够长，可以验证滚动。</p>`).join('\n')

const long = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <title>长文档</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 40px; line-height: 1.8; }
      h1 { color: #a9743f; }
      h2 { margin-top: 36px; }
    </style>
  </head>
  <body>
    <h1>长文档示例</h1>
    <p>这个文件用来验证目录提取与定位。</p>
    <h2>第一章 开始</h2>
${filler}
    <h3>1.1 细节</h3>
${filler}
    <h2>第二章 继续</h2>
${filler}
    <h3>2.1 更深一层</h3>
${filler}
    <h2>第三章 结束</h2>
${filler}
  </body>
</html>
`
fs.writeFileSync(`${dir}/another.html`, long, 'utf8')

console.log('fixtures ready:', fs.readdirSync(dir).join(', '))