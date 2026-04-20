const { sendEmail } = require('../email/resend');
const { welcomeTemplate } = require('../email/templates');

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function verifySignature(rawBody, signatureHeader) {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) return true; // secret yoksa doğrulama atlanır (geliştirme ortamı)

  const { createHmac } = await import('node:crypto').catch(() => require('crypto'));
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return signatureHeader === expected;
}

module.exports = async function authWebhookHandler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method Not Allowed');
    return;
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  const signature = String(req.headers['x-supabase-signature'] || req.headers['x-webhook-signature'] || '');
  const valid = await verifySignature(rawBody, signature);
  if (!valid) {
    res.statusCode = 401;
    res.end('Unauthorized');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.statusCode = 400;
    res.end('Invalid JSON');
    return;
  }

  const type = String(payload?.type || '').toLowerCase();
  const record = payload?.record || {};

  if (type === 'insert' && record.email) {
    const email = String(record.email || '').trim();
    const rawMeta = record.raw_user_meta_data || record.user_metadata || {};
    const customerName = String(rawMeta.full_name || rawMeta.name || '').trim() || null;

    try {
      if (process.env.RESEND_API_KEY) {
        await sendEmail({
          to: email,
          subject: 'Blaene\'ye Hoş Geldiniz!',
          html: welcomeTemplate({ customerName, email }),
        });
      }
    } catch (_) {
      // Mail hatası webhook'u engellemesin.
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
};
