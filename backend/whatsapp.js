const config = require('./config');

async function sendWhatsAppText(to, text) {
  const hasRealCreds =
    config.whatsappToken &&
    config.phoneNumberId &&
    config.whatsappToken !== 'tu_token_de_acceso' &&
    config.phoneNumberId !== 'tu_phone_number_id';

  if (!hasRealCreds) {
    return {
      messaging_product: 'whatsapp',
      contacts: [{ input: to, wa_id: to }],
      messages: [{ id: `mock-${Date.now()}` }],
      mock: true,
      note: 'Mensaje simulado en modo local'
    };
  }

  const url = `https://graph.facebook.com/${config.whatsappApiVersion}/${config.phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsappToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Error enviando mensaje a WhatsApp');
  }
  return data;
}

module.exports = { sendWhatsAppText };
