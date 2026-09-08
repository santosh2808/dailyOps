import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { fileURLToPath } from "url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
    plugins: [
        react(),
        // Installable + fast-load PWA only — NOT offline data. The generated
        // service worker precaches the build's own JS/CSS/icons (the "app
        // shell"), which is what makes the icon-tap launch fast and lets the
        // shell itself load with no connection. Deliberately no runtimeCaching
        // for API calls: every page's actual data (leads, quotations, sales
        // orders, dashboard numbers) must always come live from the backend —
        // caching that would risk showing stale prices/statuses to sales staff,
        // which is worse than a clear "you're offline" failure. If true offline
        // data support is ever wanted, that's a deliberate separate project
        // (see conversation), not something to slip in here via runtimeCaching.
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["apple-touch-icon.png", "sr-logo.png"],
            manifest: {
                name: "SR DailyOps",
                short_name: "DailyOps",
                description: "Smart Rotamach DailyOps — Sales, Production & Operations",
                theme_color: "#4b8f29",
                background_color: "#ffffff",
                display: "standalone",
                start_url: "/",
                icons: [
                    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
                    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
                    {
                        src: "/maskable-icon-512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable",
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 5173,
    },
});
