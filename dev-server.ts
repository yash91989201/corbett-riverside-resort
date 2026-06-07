/**
 * Bun dev server with automatic hot reload via WebSocket.
 * Zero external dependencies — uses only Bun built-ins + node:fs.
 *
 * Usage: bun run dev-server.ts
 */

import { watch } from "node:fs";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PORT = Number(process.env.PORT) || 3000;
const ROOT = import.meta.dir;

// ── MIME types ──────────────────────────────────────────────
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".ts": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// ── Hot-reload client (appended to HTML responses) ──────────
const HOT_CLIENT = `<script>
(() => {
  const url = "ws://" + location.host + "/__hot";
  let ws;
  function connect() {
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      if (e.data === "reload") {
        console.log("[hot] reloading…");
        location.reload();
      }
    };
    ws.onclose = () => setTimeout(connect, 1000);
    ws.onerror = () => ws.close();
  }
  connect();
  console.log("[hot] client connected");
})();
</script>`;

// ── Connected browsers ──────────────────────────────────────
const clients = new Set<WebSocket>();

function broadcast(msg: string) {
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// ── File watcher ────────────────────────────────────────────
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(ROOT, { recursive: true }, (event, filename) => {
  if (!filename) return;
  if (filename.includes("node_modules") || filename.includes(".git")) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log(`[hot] changed: ${filename}`);
    broadcast("reload");
  }, 50);
});

// ── Resolve & validate request path ─────────────────────────
function resolvePath(urlPath: string): string | null {
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  if (rel.includes("..")) return null;

  const abs = resolve(ROOT, "." + rel);
  if (!abs.startsWith(ROOT)) return null;
  if (!existsSync(abs)) return null;

  return abs;
}

// ── Server ──────────────────────────────────────────────────
const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // ── WebSocket upgrade ──
    if (url.pathname === "/__hot") {
      const ok = server.upgrade(req);
      return ok ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }

    // ── Static files ──
    const filePath = resolvePath(url.pathname);
    if (!filePath) return new Response("Not Found", { status: 404 });

    const dotIdx = filePath.lastIndexOf(".");
    const ext = dotIdx >= 0 ? filePath.slice(dotIdx) : "";
    const mime = MIME[ext] ?? "application/octet-stream";
    const headers = { "Content-Type": mime, "Cache-Control": "no-cache" };

    // For HTML: read, append hot-reload client, return
    if (ext === ".html") {
      const html = readFileSync(filePath, "utf-8");
      // Try </body> or </html> first; fall back to appending at end
      let injected: string;
      if (html.includes("</body>")) {
        injected = html.replace(/<\/body>/i, HOT_CLIENT + "\n</body>");
      } else if (html.includes("</html>")) {
        injected = html.replace(/<\/html>/i, HOT_CLIENT + "\n</html>");
      } else {
        injected = html + "\n" + HOT_CLIENT;
      }
      return new Response(injected, { headers });
    }

    // For everything else: stream from disk
    return new Response(Bun.file(filePath), { headers });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      console.log(`[ws] client connected (${clients.size} total)`);
    },
    close(ws) {
      clients.delete(ws);
      console.log(`[ws] client disconnected (${clients.size} total)`);
    },
    message() {},
  },
});

console.log(`
┌─────────────────────────────────────────┐
│  🌿 Corbett Riverside Resort Dev Server │
├─────────────────────────────────────────┤
│  http://localhost:${String(server.port).padEnd(24)}│
│                                         │
│  Pages:                                 │
│  ├─ /              (index)              │
│  ├─ /about-us.html                      │
│  ├─ /contact-us.html                    │
│  ├─ /disclaimer.html                    │
│  ├─ /privacy-policy.html                │
│  └─ /terms-and-conditions.html          │
│                                         │
│  Hot reload: watching for changes…      │
└─────────────────────────────────────────┘
`);
