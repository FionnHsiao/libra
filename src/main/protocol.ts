import { protocol, session } from 'electron'
import { promises as fs } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { decodeBuffer } from './encoding'

const SCHEME = 'libra-file'

export const PREVIEW_PARTITION = 'persist:libra-preview'

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xhtml': 'application/xhtml+xml',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown'
}

const TEXT_LIKE = new Set([
  '.html',
  '.htm',
  '.xhtml',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.svg',
  '.xml',
  '.txt',
  '.md'
])

// 只允许当前文档所在的目录：以前是所有打开过的目录累加，
// 一次会话里读过的文件夹会对之后加载的任何页面都可读。
let allowedRoot: string | null = null

export function registerPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

export function allowRoot(directory: string): void {
  allowedRoot = resolve(directory).toLowerCase()
}

function isAllowed(target: string): boolean {
  if (!allowedRoot) return false
  const normalized = resolve(target).toLowerCase()
  const rel = relative(allowedRoot, normalized)
  if (rel === '') return true
  return !rel.startsWith('..') && !isAbsolute(rel)
}

export function toPreviewUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const encoded = normalized
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${SCHEME}://local/${encoded}`
}

export function fromPreviewUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== `${SCHEME}:`) return null
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.startsWith('/')) pathname = pathname.slice(1)
    if (!pathname) return null
    return process.platform === 'win32' ? pathname.replace(/\//g, '\\') : pathname
  } catch {
    return null
  }
}

export function installPreviewProtocol(): void {
  const previewSession = session.fromPartition(PREVIEW_PARTITION)
  previewSession.protocol.handle(SCHEME, async (request) => {
    const target = fromPreviewUrl(request.url)
    if (!target) return new Response('bad request', { status: 400 })
    if (!isAllowed(target)) return new Response('forbidden', { status: 403 })

    const extension = extname(target).toLowerCase()
    const mime = MIME[extension] ?? 'application/octet-stream'

    try {
      const data = await fs.readFile(target)
      if (TEXT_LIKE.has(extension)) {
        const decoded = decodeBuffer(data)
        return new Response(Buffer.from(decoded.text, 'utf8'), {
          headers: {
            'content-type': `${mime}; charset=utf-8`,
            'cache-control': 'no-store'
          }
        })
      }
      return new Response(data, {
        headers: { 'content-type': mime, 'cache-control': 'no-store' }
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}