import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { decodeBuffer, encodeBuffer } from './encoding'
import type { DocumentData, Eol } from '../shared/protocol'

export async function readDocument(filePath: string): Promise<DocumentData> {
  const buffer = await fs.readFile(filePath)
  const decoded = decodeBuffer(buffer)
  return {
    path: filePath,
    text: decoded.text,
    encoding: decoded.encoding,
    bom: decoded.bom,
    eol: decoded.eol,
    size: buffer.byteLength
  }
}

/**
 * Writes through a temp file in the same directory, then renames.
 * A crash mid-write can never leave a half-written document behind.
 */
export async function writeTextAtomic(
  filePath: string,
  text: string,
  encoding: string,
  bom: boolean,
  eol: Eol
): Promise<number> {
  const buffer = encodeBuffer(text, encoding, bom, eol)
  const directory = dirname(filePath)
  const tempPath = join(directory, `.${basename(filePath)}.${process.pid}.${Date.now()}.libra-tmp`)

  let mode = 0o644
  try {
    mode = (await fs.stat(filePath)).mode
  } catch {
    mode = 0o644
  }

  try {
    await fs.writeFile(tempPath, buffer, { mode })
    await fs.rename(tempPath, filePath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }

  return buffer.byteLength
}