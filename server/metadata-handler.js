const Busboy = require('busboy');

const PUMP_METADATA_URL = 'https://frontend-api-v3.pump.fun/ipfs/token-metadata';
const IMAGE_FILE_NAMES = {
  'image/png': 'token-image.png',
  'image/jpeg': 'token-image.jpg',
  'image/gif': 'token-image.gif',
  'image/webp': 'token-image.webp'
};
const ALLOWED_FIELDS = new Set(['name', 'symbol', 'description', 'twitter', 'telegram', 'website']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4_500_000;
const rateLimits = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
  try { return new URL(origin).host === host; } catch { return false; }
}

function withinRateLimit(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const key = forwarded || request.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  let bucket = rateLimits.get(key);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
    rateLimits.set(key, bucket);
  }
  bucket.count += 1;
  if (rateLimits.size > 1000) {
    for (const [ip, item] of rateLimits) if (now - item.startedAt >= WINDOW_MS) rateLimits.delete(ip);
  }
  return bucket.count <= MAX_REQUESTS_PER_WINDOW;
}

function validImageSignature(buffer, mimeType) {
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/gif') {
    return buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a');
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function parseMultipart(request) {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = Busboy({
        headers: request.headers,
        limits: {
          fileSize: MAX_IMAGE_BYTES + 1,
          files: 1,
          fields: 6,
          parts: 7,
          fieldNameSize: 64,
          fieldSize: 2048
        }
      });
    } catch {
      reject(Object.assign(new Error('Send the image and metadata as a multipart form.'), { statusCode: 400 }));
      return;
    }

    const fields = Object.create(null);
    let image = null;
    let settled = false;
    const fail = (statusCode, message) => {
      if (settled) return;
      settled = true;
      request.unpipe(parser);
      parser.destroy();
      request.resume();
      reject(Object.assign(new Error(message), { statusCode }));
    };

    parser.on('field', (name, value, info) => {
      if (info.valueTruncated) return fail(413, 'Metadata fields are too large.');
      if (!ALLOWED_FIELDS.has(name) || Object.hasOwn(fields, name)) {
        return fail(400, 'The metadata form contains an unsupported or repeated field.');
      }
      fields[name] = value;
    });

    parser.on('file', (name, stream, info) => {
      const filename = IMAGE_FILE_NAMES[info.mimeType];
      if (name !== 'file' || image || !filename) {
        stream.resume();
        return fail(400, 'Attach exactly one PNG, JPG, GIF or WebP image.');
      }
      const chunks = [];
      let size = 0;
      stream.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) return fail(413, 'Choose an image under 4 MB.');
        chunks.push(chunk);
      });
      stream.on('limit', () => fail(413, 'Choose an image under 4 MB.'));
      stream.on('error', () => fail(400, 'The image upload could not be read.'));
      stream.on('end', () => {
        if (settled) return;
        const buffer = Buffer.concat(chunks);
        if (!validImageSignature(buffer, info.mimeType)) {
          return fail(400, 'The image file does not match its declared format.');
        }
        image = { buffer, mimeType: info.mimeType, filename };
      });
    });

    parser.on('fieldsLimit', () => fail(400, 'Too many metadata fields.'));
    parser.on('filesLimit', () => fail(400, 'Attach one image only.'));
    parser.on('partsLimit', () => fail(400, 'The metadata form contains too many parts.'));
    parser.on('error', () => fail(400, 'The image and metadata form could not be parsed.'));
    parser.on('finish', () => {
      if (settled) return;
      if (!image) return fail(400, 'Choose an image for the token.');
      const name = typeof fields.name === 'string' ? fields.name.trim() : '';
      const symbol = typeof fields.symbol === 'string' ? fields.symbol.trim() : '';
      const description = typeof fields.description === 'string' ? fields.description : '';
      if (!name || name.length > 32) return fail(400, 'Token name must be between 1 and 32 characters.');
      if (!/^[A-Z0-9]{2,10}$/.test(symbol)) return fail(400, 'Ticker must be 2–10 letters or numbers.');
      if (description.length > 500) return fail(400, 'Description must be 500 characters or fewer.');
      for (const key of ['twitter', 'telegram', 'website']) {
        if (fields[key] !== undefined && fields[key].length > 2048) return fail(400, 'A social link is too long.');
      }
      settled = true;
      resolve({ fields: { ...fields, name, symbol, description }, image });
    });

    request.on('aborted', () => fail(400, 'The image upload was interrupted.'));
    request.pipe(parser);
  });
}

module.exports = async function metadataHandler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Use POST to prepare a token metadata upload.' });
  }
  if (!sameOrigin(request)) return sendJson(response, 403, { error: 'Cross-origin metadata requests are not allowed.' });
  if (!withinRateLimit(request)) return sendJson(response, 429, { error: 'Too many upload requests. Wait a minute and try again.' });

  const contentLength = Number(request.headers['content-length'] || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    request.resume();
    return sendJson(response, 413, { error: 'Choose an image under 4 MB.' });
  }

  try {
    const { fields, image } = await parseMultipart(request);
    const form = new FormData();
    form.set('name', fields.name);
    form.set('symbol', fields.symbol);
    form.set('description', fields.description);
    form.set('showName', 'true');
    for (const key of ['twitter', 'telegram', 'website']) {
      if (fields[key]) form.set(key, fields[key]);
    }
    form.set('file', new Blob([image.buffer], { type: image.mimeType }), image.filename);

    const upstream = await fetch(PUMP_METADATA_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(30_000)
    });
    let result;
    try { result = await upstream.json(); } catch { result = null; }
    if (!upstream.ok) {
      console.error('Pump metadata upload rejected:', upstream.status);
      return sendJson(response, upstream.status === 429 ? 429 : 502, {
        error: upstream.status === 429
          ? 'Pump is receiving too many uploads. Wait a minute and try again.'
          : 'Pump could not accept the metadata upload. Try again later.'
      });
    }
    const metadataUri = result?.metadataUri;
    if (typeof metadataUri !== 'string' || metadataUri.length > 2048 || new URL(metadataUri).protocol !== 'https:') {
      console.error('Pump metadata upload returned an invalid URI.');
      return sendJson(response, 502, { error: 'Pump returned an invalid metadata URI.' });
    }
    return sendJson(response, 200, { metadataUri });
  } catch (error) {
    if (error?.statusCode) return sendJson(response, error.statusCode, { error: error.message });
    console.error('Pump metadata upload failed:', error?.message || error);
    return sendJson(response, 502, { error: 'Could not upload metadata to Pump. Check your connection and try again.' });
  }
};