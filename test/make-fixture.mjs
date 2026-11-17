import fs from 'node:fs'
import iconv from 'iconv-lite'

const dir = 'E:/Libra/libra/test/fixtures'
fs.mkdirSync(dir, { recursive: true })
const text = '<!doctype html>\r\n<html lang="zh-CN">\r\n  <head><meta charset="gbk"><title>示例</title></head>\r\n  <body>\r\n    <h1>中文标题</h1>\r\n    <p>这一行用来验证 GBK 编码与 CRLF 换行。</p>\r\n  </body>\r\n</html>\r\n'
fs.writeFileSync(`${dir}/sample-gbk.html`, iconv.encode(text, 'gbk'))
console.log('fixture bytes:', fs.statSync(`${dir}/sample-gbk.html`).size)