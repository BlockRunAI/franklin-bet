// Tiny static file server for local preview. No deps.
//   npm run dev   →   http://localhost:4173
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const PORT = process.env.PORT || 4173;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url || "/").split("?")[0]);
    if (path === "/" || path.endsWith("/")) path += "index.html";
    const filePath = normalize(join(ROOT, path));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end("Forbidden"); return; }
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": TYPES[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`\n  🔮 Franklin.bet running at http://localhost:${PORT}\n`);
});
