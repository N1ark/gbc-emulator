import { cloudflare } from "@cloudflare/vite-plugin";
import preact from "@preact/preset-vite";
import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [preact(), cloudflare()],
    resolve: {
        alias: {
            "@frontend": path.resolve(__dirname, "src", "frontend"),
            "@emulator": path.resolve(__dirname, "src", "emulator"),
            "@components": path.resolve(__dirname, "src", "frontend", "components"),
            "@helpers": path.resolve(__dirname, "src", "frontend", "helpers"),
        },
    },
});
