import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import packageJson from './package.json';

export default defineConfig({
    root: './',
    base: '/',
    define: {
        'process.env.APP_VERSION': JSON.stringify(packageJson.version),
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        minify: 'esbuild', // Explicitly enabled for clarity
    },
    server: {
        open: true,
    },
    plugins: [
        VitePWA({
            injectRegister: null, // We are manually registering the SW in main.js
            registerType: 'autoUpdate',
            filename: 'service-worker.js', // Ensure consistent filename
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'assets/*.png', 'assets/*.webp', 'data/*.json'],
            manifest: {
                name: "JLPT Handbook",
                short_name: "JLPT Handbook",
                description: "Your personal, interactive space to master Japanese. Dive into built-in JLPT N5 & N4 materials, or bring your own study lists by importing custom levels!",
                id: "/",
                start_url: "/index.html",
                scope: "/",
                display: "standalone",
                background_color: "#111827",
                theme_color: "#2998FF",
                icons: [
                    {
                        "src": "assets/siteIcon.png",
                        "sizes": "192x192",
                        "type": "image/png"
                    },
                    {
                        "src": "assets/siteIcon.png",
                        "sizes": "512x512",
                        "type": "image/png"
                    },
                    {
                        "src": "assets/siteIcon.webp",
                        "sizes": "192x192",
                        "type": "image/webp"
                    },
                    {
                        "src": "assets/siteIcon.webp",
                        "sizes": "512x512",
                        "type": "image/webp"
                    }
                ]
            },
            workbox: {
                navigateFallback: '/offline.html',
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json}'],
                runtimeCaching: [
                    {
                        urlPattern: ({ request }) => request.mode === 'navigate',
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'pages-cache',
                            expiration: {
                                maxEntries: 10,
                            },
                        },
                    }
                ]
            },
            devOptions: {
                enabled: true,
                type: 'module',
                navigateFallback: 'offline.html'
            }
        })
    ]
});
