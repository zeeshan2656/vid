import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.jsx'],
            refresh: true,
            fonts: [
                bunny('Instrument Sans', {
                    // Reduced from 4 weights to 2 — saves ~60KB of font data
                    // 400 = regular body text, 700 = bold headings/labels
                    weights: [400, 700],
                }),
            ],
        }),
        react(),
    ],

    build: {
        // Target modern browsers — enables smaller, faster output
        target: 'es2020',

        // Minify CSS
        cssMinify: true,

        // Warn on large chunks (default is 500KB)
        chunkSizeWarningLimit: 600,

        rollupOptions: {
            output: {
                // Manual chunk splitting for optimal caching:
                // - react core libs rarely change → long-lived browser cache
                // - axios rarely changes → separate chunk
                // - admin code only loaded on /admin/* routes (already lazy)
                manualChunks(id) {
                    if (id.includes('node_modules/react/') ||
                        id.includes('node_modules/react-dom/') ||
                        id.includes('node_modules/scheduler/')) {
                        return 'react-core';
                    }
                    if (id.includes('node_modules/react-router-dom/') ||
                        id.includes('node_modules/react-router/') ||
                        id.includes('node_modules/@remix-run/')) {
                        return 'react-router';
                    }
                    if (id.includes('node_modules/axios/')) {
                        return 'axios';
                    }
                },
            },
        },
    },

    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
