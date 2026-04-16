import busboy from 'busboy';

/**
 * Parse a multipart/form-data request.
 * Returns { fields: {key: string}, file: { data: Buffer, mimeType: string, filename: string } }
 *
 * Works with both raw Node.js IncomingMessage (local dev server)
 * and Vercel's req object (which exposes the raw body via req.body as Buffer when
 * bodyParser is disabled via export const config = { api: { bodyParser: false } }).
 */
export function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const bb = busboy({ headers: { 'content-type': contentType } });

    const fields = {};
    let file = null;

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        file = {
          data: Buffer.concat(chunks),
          mimeType: mimeType || 'application/octet-stream',
          filename: filename || '',
        };
      });
    });

    bb.on('finish', () => resolve({ fields, file }));
    bb.on('error', reject);

    // Raw Node IncomingMessage or dev-server shim with pipe
    if (typeof req.pipe === 'function') {
      req.pipe(bb);
      return;
    }

    // Vercel — body is already a Buffer or string
    if (req.body) {
      const buf = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body);
      bb.write(buf);
      bb.end();
      return;
    }

    reject(new Error('No readable body'));
  });
}
