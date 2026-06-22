// vite.config.ts
import { defineConfig } from "file:///C:/Users/Arnav%20Gawade(pro)/Downloads/chrome%20extension/extension/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/Arnav%20Gawade(pro)/Downloads/chrome%20extension/extension/node_modules/@vitejs/plugin-react/dist/index.js";
import { crx } from "file:///C:/Users/Arnav%20Gawade(pro)/Downloads/chrome%20extension/extension/node_modules/@crxjs/vite-plugin/dist/index.mjs";

// manifest.json
var manifest_default = {
  manifest_version: 3,
  name: "Semantic Memory",
  version: "1.0.0",
  description: "Search your browsing history by meaning, not keywords.",
  permissions: ["storage", "tabs", "activeTab", "scripting"],
  host_permissions: ["<all_urls>"],
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/content-script.ts"],
      run_at: "document_idle"
    }
  ],
  action: {
    default_popup: "popup.html",
    default_icon: {
      "16": "public/icons/icon16.png",
      "48": "public/icons/icon48.png",
      "128": "public/icons/icon128.png"
    }
  },
  icons: {
    "16": "public/icons/icon16.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png"
  }
};

// vite.config.ts
var vite_config_default = defineConfig({
  plugins: [
    react(),
    crx({ manifest: manifest_default })
  ],
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        popup: "popup.html"
      }
    }
  },
  worker: {
    format: "es"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAibWFuaWZlc3QuanNvbiJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXEFybmF2IEdhd2FkZShwcm8pXFxcXERvd25sb2Fkc1xcXFxjaHJvbWUgZXh0ZW5zaW9uXFxcXGV4dGVuc2lvblwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcQXJuYXYgR2F3YWRlKHBybylcXFxcRG93bmxvYWRzXFxcXGNocm9tZSBleHRlbnNpb25cXFxcZXh0ZW5zaW9uXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9Bcm5hdiUyMEdhd2FkZShwcm8pL0Rvd25sb2Fkcy9jaHJvbWUlMjBleHRlbnNpb24vZXh0ZW5zaW9uL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHsgY3J4IH0gZnJvbSAnQGNyeGpzL3ZpdGUtcGx1Z2luJztcbmltcG9ydCBtYW5pZmVzdCBmcm9tICcuL21hbmlmZXN0Lmpzb24nO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICBjcngoeyBtYW5pZmVzdCB9KSxcbiAgXSxcbiAgYnVpbGQ6IHtcbiAgICB0YXJnZXQ6ICdlczIwMjInLFxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIHBvcHVwOiAncG9wdXAuaHRtbCcsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIHdvcmtlcjoge1xuICAgIGZvcm1hdDogJ2VzJyxcbiAgfSxcbn0pO1xuIiwgIntcbiAgXCJtYW5pZmVzdF92ZXJzaW9uXCI6IDMsXG4gIFwibmFtZVwiOiBcIlNlbWFudGljIE1lbW9yeVwiLFxuICBcInZlcnNpb25cIjogXCIxLjAuMFwiLFxuICBcImRlc2NyaXB0aW9uXCI6IFwiU2VhcmNoIHlvdXIgYnJvd3NpbmcgaGlzdG9yeSBieSBtZWFuaW5nLCBub3Qga2V5d29yZHMuXCIsXG4gIFwicGVybWlzc2lvbnNcIjogW1wic3RvcmFnZVwiLCBcInRhYnNcIiwgXCJhY3RpdmVUYWJcIiwgXCJzY3JpcHRpbmdcIl0sXG4gIFwiaG9zdF9wZXJtaXNzaW9uc1wiOiBbXCI8YWxsX3VybHM+XCJdLFxuICBcImJhY2tncm91bmRcIjoge1xuICAgIFwic2VydmljZV93b3JrZXJcIjogXCJzcmMvYmFja2dyb3VuZC9zZXJ2aWNlLXdvcmtlci50c1wiLFxuICAgIFwidHlwZVwiOiBcIm1vZHVsZVwiXG4gIH0sXG4gIFwiY29udGVudF9zY3JpcHRzXCI6IFtcbiAgICB7XG4gICAgICBcIm1hdGNoZXNcIjogW1wiPGFsbF91cmxzPlwiXSxcbiAgICAgIFwianNcIjogW1wic3JjL2NvbnRlbnQvY29udGVudC1zY3JpcHQudHNcIl0sXG4gICAgICBcInJ1bl9hdFwiOiBcImRvY3VtZW50X2lkbGVcIlxuICAgIH1cbiAgXSxcbiAgXCJhY3Rpb25cIjoge1xuICAgIFwiZGVmYXVsdF9wb3B1cFwiOiBcInBvcHVwLmh0bWxcIixcbiAgICBcImRlZmF1bHRfaWNvblwiOiB7XG4gICAgICBcIjE2XCI6IFwicHVibGljL2ljb25zL2ljb24xNi5wbmdcIixcbiAgICAgIFwiNDhcIjogXCJwdWJsaWMvaWNvbnMvaWNvbjQ4LnBuZ1wiLFxuICAgICAgXCIxMjhcIjogXCJwdWJsaWMvaWNvbnMvaWNvbjEyOC5wbmdcIlxuICAgIH1cbiAgfSxcbiAgXCJpY29uc1wiOiB7XG4gICAgXCIxNlwiOiBcInB1YmxpYy9pY29ucy9pY29uMTYucG5nXCIsXG4gICAgXCI0OFwiOiBcInB1YmxpYy9pY29ucy9pY29uNDgucG5nXCIsXG4gICAgXCIxMjhcIjogXCJwdWJsaWMvaWNvbnMvaWNvbjEyOC5wbmdcIlxuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQStYLFNBQVMsb0JBQW9CO0FBQzVaLE9BQU8sV0FBVztBQUNsQixTQUFTLFdBQVc7OztBQ0ZwQjtBQUFBLEVBQ0Usa0JBQW9CO0FBQUEsRUFDcEIsTUFBUTtBQUFBLEVBQ1IsU0FBVztBQUFBLEVBQ1gsYUFBZTtBQUFBLEVBQ2YsYUFBZSxDQUFDLFdBQVcsUUFBUSxhQUFhLFdBQVc7QUFBQSxFQUMzRCxrQkFBb0IsQ0FBQyxZQUFZO0FBQUEsRUFDakMsWUFBYztBQUFBLElBQ1osZ0JBQWtCO0FBQUEsSUFDbEIsTUFBUTtBQUFBLEVBQ1Y7QUFBQSxFQUNBLGlCQUFtQjtBQUFBLElBQ2pCO0FBQUEsTUFDRSxTQUFXLENBQUMsWUFBWTtBQUFBLE1BQ3hCLElBQU0sQ0FBQywrQkFBK0I7QUFBQSxNQUN0QyxRQUFVO0FBQUEsSUFDWjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVU7QUFBQSxJQUNSLGVBQWlCO0FBQUEsSUFDakIsY0FBZ0I7QUFBQSxNQUNkLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE9BQU87QUFBQSxJQUNUO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFDRjs7O0FEMUJBLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLElBQUksRUFBRSwyQkFBUyxDQUFDO0FBQUEsRUFDbEI7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLGVBQWU7QUFBQSxNQUNiLE9BQU87QUFBQSxRQUNMLE9BQU87QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLFFBQVE7QUFBQSxFQUNWO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
