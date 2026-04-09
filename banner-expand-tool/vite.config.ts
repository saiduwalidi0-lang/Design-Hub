import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const comfyuiEndpoint = (env.VITE_COMFYUI_ENDPOINT ?? 'http://127.0.0.1:8188').trim()
  const saliencyEndpoint = (env.VITE_SALIENCY_SEG_ENDPOINT ?? '').trim()
  const saliencyAppKey = (env.VITE_SALIENCY_SEG_APP_KEY ?? '').trim()
  const saliencyAppSecret = (env.VITE_SALIENCY_SEG_APP_SECRET ?? '').trim()
  const rmbgLocalServer = (env.VITE_RMBG_LOCAL_SERVER ?? 'http://127.0.0.1:8765').trim()
  /** 浏览器直连火山 Ark 常触发 CORS → Failed to fetch；开发时走同源代理 */
  const arkProxyTarget = (env.VITE_ARK_PROXY_TARGET ?? 'https://ark.cn-beijing.volces.com').trim()

  const proxyRules: Record<string, unknown> = {}

  try {
    const comfyUrl = new URL(comfyuiEndpoint)
    proxyRules['/api/comfyui'] = {
      target: `${comfyUrl.protocol}//${comfyUrl.host}`,
      changeOrigin: true,
      secure: false,
      headers: {
        origin: comfyUrl.origin,
        referer: `${comfyUrl.origin}/`,
      },
      rewrite: (path: string) => path.replace(/^\/api\/comfyui/, ''),
    }
  } catch {
    // ignore invalid comfy URL
  }

  if (saliencyEndpoint) {
    try {
      const url = new URL(saliencyEndpoint)
      const headers: Record<string, string> = {}
      if (saliencyAppKey) headers['x-app-key'] = saliencyAppKey
      if (saliencyAppSecret) headers['x-app-secret'] = saliencyAppSecret

      proxyRules['/api/saliency-seg'] = {
        target: `${url.protocol}//${url.host}`,
        changeOrigin: true,
        secure: false,
        headers,
        rewrite: () => url.pathname,
      }
      proxyRules['/api/byteartist-afr'] = {
        target: `${url.protocol}//${url.host}`,
        changeOrigin: true,
        secure: false,
        rewrite: () => url.pathname,
      }
    } catch {
      // ignore invalid saliency URL
    }
  }

  try {
    const arkUrl = new URL(arkProxyTarget)
    proxyRules['/api/volc-ark'] = {
      target: `${arkUrl.protocol}//${arkUrl.host}`,
      changeOrigin: true,
      secure: true,
      rewrite: (path: string) => {
        const next = path.replace(/^\/api\/volc-ark/, '')
        return next.length > 0 ? next : '/'
      },
    }
  } catch {
    // ignore invalid Ark proxy URL
  }

  try {
    const rmbgUrl = new URL(rmbgLocalServer)
    proxyRules['/api/rmbg-local'] = {
      target: `${rmbgUrl.protocol}//${rmbgUrl.host}`,
      changeOrigin: true,
      secure: false,
      rewrite: (path: string) => {
        const next = path.replace(/^\/api\/rmbg-local/, '')
        return next.length > 0 ? next : '/'
      },
    }
  } catch {
    // ignore invalid RMBG server URL
  }

  const server = {
    port: 5188,
    strictPort: false,
    ...(Object.keys(proxyRules).length > 0 ? { proxy: proxyRules } : {}),
  }

  return {
    build: {
      sourcemap: 'hidden',
    },
    server,
    plugins: [
      react({
        babel: {
          plugins: ['react-dev-locator'],
        },
      }),
      traeBadgePlugin({
        variant: 'dark',
        position: 'bottom-right',
        prodOnly: true,
        clickable: true,
        clickUrl: 'https://www.trae.ai/solo?showJoin=1',
        autoTheme: true,
        autoThemeTarget: '#root',
      }),
      tsconfigPaths(),
    ],
  }
})
