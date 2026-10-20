import { defineConfig } from 'vite';

export default defineConfig({
  // 使用相对路径，使产物在 Tauri 的自定义协议下不需要知道绝对挂载点
  base: './',
  // 皮肤包放在 assets 目录下，构建时整体复制到产物根目录的 skins 子目录
  publicDir: 'assets',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    emptyOutDir: true,
    sourcemap: false,
  },
});
