// Static file server for the showcase (local dev + the Cloud Run container).
//   npm run dev   →   http://localhost:4173
//
// Beyond plain static files it does three SEO things so shared match links
// preview well and get indexed:
//   • /m/<id>        → serves the SPA shell with per-match <title> + OG/Twitter
//                       meta injected (the team names, AI consensus, etc.)
//   • /sitemap.xml   → generated from data/events.json
//   • /robots.txt    → allows all + points at the sitemap
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync as readSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "../assets/safe.js";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const PORT = process.env.PORT || 4173;
const SITE = process.env.SITE_ORIGIN || "https://franklin.bet";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};
const esc = escapeHtml;
const readJSON = (p) => { try { return JSON.parse(readSync(join(ROOT, p), "utf8")); } catch { return null; } };
// Readable URL slug — MUST match slugify()/eventSlug() in assets/app.js.
const slugify = (s) => String(s || "").normalize("NFKD").replace(/[^\w\s-]/g, "").toLowerCase().trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
const eventSlug = (ev) => (ev.home && ev.away) ? `${slugify(ev.home)}-vs-${slugify(ev.away)}` : slugify(ev.title || ev.id);

// Per-match <title> + OG/Twitter meta for /m/<slug>, injected into the SPA
// shell. `key` is the slug (or, for old links, the event id).
function injectMatchMeta(html, key) {
  const events = readJSON("data/events.json") || [];
  const ev = events.find((e) => eventSlug(e) === key) || events.find((e) => e.id === key);
  if (!ev) return html;
  const name = ev.home && ev.away ? `${ev.home} vs ${ev.away}` : (ev.title || ev.id);
  const votes = (readJSON("data/predictions.json")?.byEvent || {})[ev.id] || [];
  let pickLine = "";
  if (votes.length) {
    const tally = {}, weight = {};
    for (const v of votes) { tally[v.pick] = (tally[v.pick] || 0) + 1; weight[v.pick] = (weight[v.pick] || 0) + (v.confidence || 0); }
    const top = Object.entries(tally).sort((a, b) => (weight[b[0]] - weight[a[0]]) || (b[1] - a[1]))[0];
    pickLine = ` Council consensus: ${top[0]} (${top[1]}/${votes.length}).`;
  }
  const title = `${name} — AI World Cup prediction · Franklin.bet`;
  const desc = `${votes.length || 8} frontier AI models predict ${name}.${pickLine} Every model's pick, confidence and live research — Franklin.bet by BlockRun.ai.`;
  const url = `${SITE}/m/${eventSlug(ev)}`;
  const extra = [
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
  ].join("\n  ");
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace("</head>", `  ${extra}\n</head>`);
}

function sitemap() {
  const events = readJSON("data/events.json") || [];
  const urls = [`<url><loc>${SITE}/</loc></url>`,
    ...events.map((e) => `<url><loc>${SITE}/m/${eventSlug(e)}</loc></url>`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

const PUBLIC_ROOT_FILES = new Set(["index.html", "oracle.config.json"]);
const PUBLIC_DIRS = new Set(["assets", "data"]);

/** Resolve only files that are intentionally public in both dev and production. */
export function resolvePublicFile(reqPath, root = ROOT) {
  const route = reqPath === "/" ? "/index.html" : reqPath;
  if (!route.startsWith("/") || route.endsWith("/")) return null;
  const parts = route.slice(1).split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) return null;
  const allowed = (parts.length === 1 && PUBLIC_ROOT_FILES.has(parts[0])) || PUBLIC_DIRS.has(parts[0]);
  if (!allowed) return null;
  const filePath = normalize(join(root, ...parts));
  return filePath.startsWith(normalize(root) + sep) ? filePath : null;
}

export const server = createServer(async (req, res) => {
  try {
    const reqPath = decodeURIComponent((req.url || "/").split("?")[0]);

    // Generated SEO endpoints
    if (reqPath === "/robots.txt") {
      res.writeHead(200, { "Content-Type": TYPES[".txt"] });
      res.end(`User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`); return;
    }
    if (reqPath === "/sitemap.xml") {
      res.writeHead(200, { "Content-Type": TYPES[".xml"] }); res.end(sitemap()); return;
    }

    // Per-match deep link → SPA shell + injected meta (the id need not be valid;
    // unknown ids just fall back to the default head, the SPA shows "not found").
    const matchId = reqPath.match(/^\/m\/([^/]+)\/?$/);
    if (matchId) {
      const html = await readFile(join(ROOT, "index.html"), "utf8");
      res.writeHead(200, { "Content-Type": TYPES[".html"] });
      res.end(injectMatchMeta(html, decodeURIComponent(matchId[1]))); return;
    }

    // Static files
    const filePath = resolvePublicFile(reqPath);
    if (!filePath) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
});

if (process.argv[1] && normalize(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`\n  🔮 Franklin.bet running at http://localhost:${PORT}\n`);
  });
}
