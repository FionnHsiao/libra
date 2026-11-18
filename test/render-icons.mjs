import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const collapse = 'M6.9 1.2h2.2v3.2H6.9zM4.9 4.4h6.2L8 7.8zM6.9 14.8h2.2v-3.2H6.9zM4.9 11.6h6.2L8 8.2z'
const expand = 'M6.9 4.8h2.2v2.5H6.9zM4.9 4.8h6.2L8 1.4zM6.9 8.7h2.2V11.2H6.9zM4.9 11.2h6.2L8 14.6z'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 140" width="300" height="140">
  <rect width="300" height="140" fill="#ffffff"/>
  <g transform="translate(40 20) scale(6)" fill="#1d1d1f"><path d="${collapse}"/></g>
  <g transform="translate(200 20) scale(6)" fill="#1d1d1f"><path d="${expand}"/></g>
  <text x="52" y="130" font-family="sans-serif" font-size="11" fill="#86868b">collapse</text>
  <text x="212" y="130" font-family="sans-serif" font-size="11" fill="#86868b">expand</text>
</svg>`

const out = path.join(os.tmpdir(), 'libra-icons.png')
await sharp(Buffer.from(svg)).png().toFile(out)
console.log('saved', out)