import { defineConfig, type Plugin } from 'vite';

// Сайт должен открываться двойным щелчком по dist/index.html, без сервера.
// Браузер не пускает модульные скрипты с file://, поэтому собираем один обычный скрипт.
const classicScript = (): Plugin => ({
  name: 'classic-script',
  enforce: 'post',
  transformIndexHtml(html) {
    return html.replace(/<script type="module" crossorigin/g, '<script defer');
  },
});

export default defineConfig({
  base: './',
  plugins: [classicScript()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: { output: { format: 'iife' } },
  },
});
