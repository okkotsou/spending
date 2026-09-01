import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const resolveSrc = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Emits a service worker whose precache list is the real, content-hashed
 * bundle. Keeping this in-repo avoids a build-tool dependency and keeps the
 * caching strategy readable: precache the app shell, serve it cache-first,
 * and fall back to the shell for navigations so the app opens offline.
 */
function serviceWorkerPlugin(base: string): Plugin {
  return {
    name: 'misraf-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((name) => !name.endsWith('.map'))
        // Legacy .woff duplicates every .woff2 face. Every browser that can run
        // this app reads woff2, so precaching both would double the install
        // payload for files that are never requested.
        .filter((name) => !name.endsWith('.woff'))
        .map((name) => base + name);
      // Files copied straight from public/ are not part of the bundle graph,
      // so the ones the installed app needs are named explicitly.
      const staticAssets = [
        'manifest.webmanifest',
        'favicon.svg',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-512.png',
        'icons/apple-touch-icon.png',
      ].map((name) => base + name);
      const precache = [base, ...staticAssets, ...assets];
      const template = readFileSync(resolveSrc('./src/pwa/sw-template.js'), 'utf8');
      const revision = Date.now().toString(36);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__PRECACHE_MANIFEST__', JSON.stringify(precache))
          .replace('__CACHE_REVISION__', JSON.stringify(revision))
          .replace('__APP_SHELL__', JSON.stringify(base)),
      });
    },
  };
}

export default defineConfig(() => {
  // GitHub Pages project sites are served from /<repo>/. Netlify and custom
  // domains are served from /. BASE_PATH lets one build config serve both.
  const base = process.env.BASE_PATH ?? '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;

  return {
    base: normalizedBase,
    plugins: [react(), tailwindcss(), serviceWorkerPlugin(normalizedBase)],
    resolve: {
      alias: { '@': resolveSrc('./src') },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          // The chart and storage libraries are the two heavy dependencies;
          // splitting them keeps the first paint of the dashboard small and
          // lets the service worker cache them independently of app code.
          manualChunks(id: string) {
            if (/node_modules\/(recharts|d3-|victory-)/.test(id)) return 'charts';
            if (/node_modules\/dexie/.test(id)) return 'db';
            return undefined;
          },
        },
      },
    },
  };
});
