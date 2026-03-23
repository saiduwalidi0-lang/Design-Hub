const url =
  'https://www.figma.com/design/gQf51S7xXGjTvmdZjMSFpJ/%E3%80%90Self-Configured%E3%80%9126-SEA-FEST--SEA?node-id=1310-13747&t=I1tjNM8wGP9dXobp-1'

const res = await fetch(`http://localhost:3002/api/figma/describe?url=${encodeURIComponent(url)}`)
process.stdout.write(`status=${res.status}\n`)
process.stdout.write((await res.text()) + '\n')

