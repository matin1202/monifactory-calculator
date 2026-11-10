// Minimal dev server on port 5500: compiled scripts from dist/, static files
// straight from the repository so edits to assets/ and data/ show up on reload.
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT) || 5500;
const TYPES = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
    ".map": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf",
    ".woff": "font/woff", ".woff2": "font/woff2", ".bin": "application/octet-stream",
};

function Resolve(urlPath) {
    const path = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, "");
    if (path.startsWith(".."))
        return null;
    if (path === "" || path === "index.html")
        return "index.html";
    if (path.startsWith("assets") || path.startsWith("data"))
        return path;
    return join("dist", path);
}

createServer((req, res) => {
    const file = Resolve(new URL(req.url, "http://localhost").pathname);
    try {
        if (!file || !statSync(file).isFile())
            throw new Error();
    } catch {
        res.writeHead(404).end("Not found");
        return;
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Serving on http://localhost:${PORT}`));
