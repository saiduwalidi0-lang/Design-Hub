import 'dotenv/config'
import dotenv from 'dotenv'
import { generateArkImage, isArkImageConfigured } from '../api/services/arkImageProvider.ts'

dotenv.config({ path: '.env.local', override: true })

if (!isArkImageConfigured()) {
  process.stdout.write('ark image not configured\n')
  process.exit(1)
}

const img = await generateArkImage({
  prompt: 'minimal abstract poster, bold composition, high contrast, no text',
  size: 'landscape_16_9',
})

process.stdout.write(`ok contentType=${img.contentType} sha256=${img.sha256.slice(0, 12)} bytes=${img.bytes.byteLength}\n`)
