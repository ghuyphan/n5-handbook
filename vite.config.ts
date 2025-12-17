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
        rollupOptions: {
            output: {
                // Separate vendor chunks for better caching
                manualChunks: {
                    vendor: ['idb', 'wanakana']
                }
            }
        }
    },
    server: {
        open: true,
    },
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
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
                    }
                ]
            },
            workbox: {
                navigateFallback: '/index.html',
                navigateFallbackAllowlist: [/^\/.*$/], // Match ALL paths
                skipWaiting: true,
                clientsClaim: true,
                cleanupOutdatedCaches: true,
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json}'],
                globIgnores: ['assets/siteIcon.png'], // Prevent conflict with manifest icons
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'gstatic-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    }
                ]
            },
            devOptions: {
                enabled: true,
                type: 'module',
                navigateFallback: 'index.html'
            }
        })
    ]
});
