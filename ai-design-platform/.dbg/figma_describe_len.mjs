const url =
  'http://localhost:3002/api/figma/describe?url=' +
  encodeURIComponent(
    'https://www.figma.com/design/gQf51S7xXGjTvmdZjMSFpJ/%E3%80%90Self-Configured%E3%80%9126-SEA-FEST--SEA?node-id=1310-13747&t=I1tjNM8wGP9dXobp-1',
  )

const res = await fetch(url)
const json = await res.json().catch(() => null)
process.stdout.write(`status=${res.status}\n`)
process.stdout.write(`hasCaption=${Boolean(json?.caption)} len=${json?.caption?.length ?? 0} error=${json?.error ?? ''}\n`)
if (json?.caption) process.stdout.write(json.caption + '\n')

