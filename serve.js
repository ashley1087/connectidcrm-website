// Static file server for local preview — run with: bun serve.js
import { join, extname } from "path";

const ROOT = "/Users/Ashley/Documents/Claude/connectidcrm-website";
const PORT = 4321;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".pdf":  "application/pdf",
};

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    // Strip query string, sanitize path traversal
    pathname = pathname.split("?")[0].replace(/\.\./g, "");
    // Directory index: /worksheets/ → /worksheets/index.html
    if (pathname.endsWith("/")) pathname += "index.html";
    const filePath = join(ROOT, pathname);
    const file = Bun.file(filePath);
    return file.exists().then(exists => {
      if (exists) {
        const ext = extname(filePath).toLowerCase();
        return new Response(file, {
          headers: { "Content-Type": MIME[ext] || "application/octet-stream" }
        });
      }
      // SPA fallback
      return new Response(Bun.file(join(ROOT, "index.html")), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    });
  }
});

console.log(`Serving connectidcrm-website on http://localhost:${PORT}`);
