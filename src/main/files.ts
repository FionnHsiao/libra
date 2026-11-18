import { promises as fs } from 'node:fs'
import { decodeBuffer } from './encoding'
import type { DocumentData } from '../shared/protocol'

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
