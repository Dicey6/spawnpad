const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const metadataHandler = require('./server/metadata-handler');

const ROOT = __dirname;
const PUBLIC_FILES = new Set(['index.html', 'app.js', 'config.js', 'styles.css', 'launch-sdk.bundle.js']);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

const server = http.createServer(async (request, response) => {
  setSecurityHeaders(response);
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end('Bad request'); return; }

  if (pathname === '/api/metadata' || pathname === '/api/metadata/') {
    try { await metadataHandler(request, response); }
    catch { if (!response.headersSent) response.writeHead(500).end('Metadata service error'); }
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relative);
  const isAsset = path.relative(path.join(ROOT, 'assets'), filePath).split(path.sep)[0] !== '..' && filePath.startsWith(path.join(ROOT, 'assets') + path.sep);
  if (!PUBLIC_FILES.has(relative) && !isAsset) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) throw new Error('Not a file');
    response.statusCode = 200;
    response.setHeader('Content-Type', MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    response.setHeader('Cache-Control', isAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => console.log(`Spawn Pad server listening on port ${port}`));