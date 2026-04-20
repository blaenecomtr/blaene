const RESEND_API_URL = 'https://api.resend.com/emails';

function getResendApiKey() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY env var is not set');
  return key;
}

/**
 * @param {{ from?: string, to: string, subject: string, html: string }} options
 */
async function sendEmail({ from, to, subject, html }) {
  const apiKey = getResendApiKey();
  const fromAddress = from || process.env.RESEND_FROM_EMAIL || 'Blaene <noreply@blaene.com.tr>';

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromAddress, to, subject, html }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.message || data?.name || 'Resend API error';
    throw new Error(`Resend error (${response.status}): ${message}`);
  }

  return data;
}

module.exports = { sendEmail };
