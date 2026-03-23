import fs from 'node:fs'

function envFlag(name: string): boolean {
  const v = process.env[name]
  if (!v) return false
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())
}

function resolveConfigPath(): string {
  return process.env.OPENCLAW_CONFIG_PATH?.trim() || 'D:/openclaw/config/openclaw.json'
}

type GatewayAuth = { mode?: string; password?: string; token?: string }

function readGatewayAuthFromConfig(): GatewayAuth | null {
  try {
    const raw = fs.readFileSync(resolveConfigPath(), 'utf8')
    const json = JSON.parse(raw) as any
    const auth = json?.gateway?.auth
    if (!auth || typeof auth !== 'object') return null
    return {
      mode: typeof auth.mode === 'string' ? auth.mode : undefined,
      password: typeof auth.password === 'string' ? auth.password : undefined,
      token: typeof auth.token === 'string' ? auth.token : undefined,
    }
  } catch {
    return null
  }
}

function readGatewayPortFromConfig(): number | null {
  try {
    const raw = fs.readFileSync(resolveConfigPath(), 'utf8')
    const json = JSON.parse(raw) as any
    const port = json?.gateway?.port
    const n = Number(port)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  } catch {
    return null
  }
}

export function applyOpenClawEnv(): {
  enabled: boolean
  configured: boolean
  reason?: string
} {
  const enabled = envFlag('OPENCLAW_ENABLE')
  if (!enabled) return { enabled: false, configured: false, reason: 'disabled' }

  const auth = readGatewayAuthFromConfig()
  if (!auth) return { enabled: true, configured: false, reason: 'config_unreadable' }

  const secret =
    auth.mode === 'password' ? auth.password : auth.mode === 'token' ? auth.token : undefined
  if (!secret) return { enabled: true, configured: false, reason: 'missing_gateway_auth' }

  const port = readGatewayPortFromConfig() ?? 18789
  process.env.AI_BASE_URL = `http://127.0.0.1:${port}/v1`
  process.env.AI_MODEL = process.env.AI_MODEL?.trim() || 'auto'
  process.env.AI_API_KEY = secret

  return { enabled: true, configured: true }
}

