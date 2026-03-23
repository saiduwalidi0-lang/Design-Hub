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

  const proxy = (() => {
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
      // ignore
    }

    if (saliencyEndpoint) {
      let url: URL
      try {
        url = new URL(saliencyEndpoint)
      } catch {
        return Object.keys(proxyRules).length ? proxyRules : undefined
      }

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
    }

    return Object.keys(proxyRules).length ? proxyRules : undefined
  })()

  return {
    build: {
      sourcemap: 'hidden',
    },
    server: proxy ? { proxy } : undefined,
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
