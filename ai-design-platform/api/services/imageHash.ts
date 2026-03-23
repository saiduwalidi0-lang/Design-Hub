import { createHash } from 'crypto'

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

