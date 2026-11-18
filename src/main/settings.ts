import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

export interface JarEntry {
  kind: 'dir' | 'file'
  path: string
}

export interface Settings {
  entries: JarEntry[]
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === 'string' && isAbsolute(value) && existsSync(value)
}

function isDirectory(value: unknown): value is string {
  if (!isAbsolutePath(value)) return false
  try {
    return statSync(value).isDirectory()
  } catch {
    return false
  }
}

function sanitizeEntries(raw: unknown): JarEntry[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const entries: JarEntry[] = []

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Partial<JarEntry>
    const path = entry.path
    if (!isAbsolutePath(path)) continue
    const kind = entry.kind === 'dir' ? 'dir' : entry.kind === 'file' ? 'file' : null
    if (!kind) continue
    if (kind === 'dir' && !isDirectory(path)) continue

    const key = path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ kind, path })
  }

  return entries
}

export function loadSettings(): Settings {
  try {
    const raw = readFileSync(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as { entries?: unknown; jars?: unknown }

    if (Array.isArray(parsed.entries)) {
      return { entries: sanitizeEntries(parsed.entries) }
    }

    // 旧版只存目录列表，迁移成 entries
    if (Array.isArray(parsed.jars)) {
      const entries = parsed.jars
        .filter(isDirectory)
        .map((path) => ({ kind: 'dir' as const, path }))
      return { entries }
    }

    return { entries: [] }
  } catch {
    return { entries: [] }
  }
}

export function saveSettings(next: Settings): void {
  try {
    const file = settingsPath()
    mkdirSync(dirname(file), { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8')
    renameSync(temp, file)
  } catch {
    /* 写不进去不影响使用 */
  }
}

export function loadEntries(): JarEntry[] {
  return loadSettings().entries
}

export function saveEntries(entries: JarEntry[]): void {
  saveSettings({ entries: sanitizeEntries(entries) })
}