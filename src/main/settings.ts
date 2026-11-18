import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

export interface Settings {
  jars: string[]
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function isDirectory(value: unknown): value is string {
  if (typeof value !== 'string' || !isAbsolute(value)) return false
  try {
    return statSync(value).isDirectory()
  } catch {
    return false
  }
}

export function loadSettings(): Settings {
  try {
    const raw = readFileSync(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Settings>
    const jars = Array.isArray(parsed.jars) ? parsed.jars.filter(isDirectory) : []
    return { jars }
  } catch {
    return { jars: [] }
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

export function loadJars(): string[] {
  return loadSettings().jars.filter((path) => existsSync(path))
}

export function saveJars(jars: string[]): void {
  saveSettings({ jars: jars.filter(isDirectory) })
}