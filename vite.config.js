import { defineConfig } from 'vite';

// GitHub Pages serverar sidan under /supcom-defense/, lokalt körs den från roten.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/supcom-defense/' : '/',
}));
