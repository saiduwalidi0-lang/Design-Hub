import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { viteSingleFile } from 'vite-plugin-singlefile';

// https://vite.dev/config/
// 注意：不要在此加入会请求外域的插件；Figma 插件 UI 受 manifest networkAccess 约束，外链易导致白屏或加载失败。
export default defineConfig({
  base: './',
  build: {
    sourcemap: 'hidden',
    target: 'es2017',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
        ],
      },
    }),
    viteSingleFile(),
    tsconfigPaths()
  ],
})
