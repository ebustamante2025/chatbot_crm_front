const crypto = require('crypto');

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function hashPassword(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createSampleDb() {
  const users = [
    { id: 1, full_name: 'Laura Moreno', email: 'laura@wps.local', password_hash: hashPassword('Admin12345'), role: 'ADMIN', availability_status: 'DISPONIBLE', is_active: true, created_at: minutesAgo(5000) },
    { id: 2, full_name: 'Daniel Rojas', email: 'daniel@wps.local', password_hash: hashPassword('Asesor12345'), role: 'ASESOR', availability_status: 'DISPONIBLE', is_active: true, created_at: minutesAgo(4200) },
    { id: 3, full_name: 'Camila Torres', email: 'camila@wps.local', password_hash: hashPassword('Supervisor123'), role: 'SUPERVISOR', availability_status: 'AUSENTE', is_active: true, created_at: minutesAgo(3900) },
    { id: 4, full_name: 'Juan Perez', email: 'juan@wps.local', password_hash: hashPassword('Asesor67890'), role: 'ASESOR', availability_status: 'DISPONIBLE', is_active: true, created_at: minutesAgo(3500) }
  ];

  const contacts = [
    { id: 1, phone: '573001112233', name: 'Carlos Mejia', created_at: minutesAgo(240), last_message_at: minutesAgo(8) },
    { id: 2, phone: '573154447788', name: 'Laura Sanchez', created_at: minutesAgo(180), last_message_at: minutesAgo(22) },
    { id: 3, phone: '573209991100', name: 'Inversiones Andinas', created_at: minutesAgo(130), last_message_at: minutesAgo(45) },
    { id: 4, phone: '573102223344', name: 'Marcela Castro', created_at: minutesAgo(300), last_message_at: minutesAgo(120) }
  ];

  const conversations = [
    { id: 1, contact_id: 1, case_status: 'ATENDIENDO', current_assigned_user_id: 2, channel: 'WHATSAPP', priority: 'ALTA', tags: ['premium'], internal_notes: 'Cliente evaluando upgrade', created_at: minutesAgo(30), updated_at: minutesAgo(8), closed_at: null },
    { id: 2, contact_id: 2, case_status: 'SIN_TOMAR_CASO', current_assigned_user_id: null, channel: 'WHATSAPP', priority: 'MEDIA', tags: ['pedido'], internal_notes: '', created_at: minutesAgo(50), updated_at: minutesAgo(22), closed_at: null },
    { id: 3, contact_id: 3, case_status: 'REVISADO', current_assigned_user_id: 2, channel: 'WHATSAPP', priority: 'ALTA', tags: ['demo', 'b2b'], internal_notes: 'Solicita agenda esta semana', created_at: minutesAgo(60), updated_at: minutesAgo(45), closed_at: null },
    { id: 4, contact_id: 4, case_status: 'SIN_TOMAR_CASO', current_assigned_user_id: null, channel: 'WHATSAPP', priority: 'URGENTE', tags: ['soporte'], internal_notes: 'Sin respuesta previa', created_at: minutesAgo(200), updated_at: minutesAgo(120), closed_at: null }
  ];

  const assignments = [];

  const messages = [
    { id: 1, conversation_id: 1, phone: '573001112233', direction: 'inbound', text: 'Hola, quiero informacion del plan premium.', whatsapp_message_id: null, message_status: 'RECIBIDO', created_at: minutesAgo(16) },
    { id: 2, conversation_id: 1, phone: '573001112233', direction: 'outbound', text: 'Hola Carlos, claro. Te comparto precios y beneficios ahora mismo.', whatsapp_message_id: null, message_status: 'ENVIADO', created_at: minutesAgo(15) },
    { id: 3, conversation_id: 1, phone: '573001112233', direction: 'inbound', text: 'Perfecto, tambien necesito saber tiempos de implementacion.', whatsapp_message_id: null, message_status: 'RECIBIDO', created_at: minutesAgo(8) },
    { id: 4, conversation_id: 2, phone: '573154447788', direction: 'inbound', text: 'Buen dia, me ayudas con el estado de mi pedido 7842?', whatsapp_message_id: null, message_status: 'RECIBIDO', created_at: minutesAgo(32) },
    { id: 5, conversation_id: 2, phone: '573154447788', direction: 'outbound', text: 'Hola Laura, ya lo reviso. Te confirmo en unos minutos.', whatsapp_message_id: null, message_status: 'ENVIADO', created_at: minutesAgo(22) },
    { id: 6, conversation_id: 3, phone: '573209991100', direction: 'inbound', text: 'Necesitamos una demo para 10 usuarios esta semana.', whatsapp_message_id: null, message_status: 'RECIBIDO', created_at: minutesAgo(45) },
    { id: 7, conversation_id: 4, phone: '573102223344', direction: 'inbound', text: 'Hola, no he recibido respuesta de soporte.', whatsapp_message_id: null, message_status: 'RECIBIDO', created_at: minutesAgo(120) }
  ];

  return { users, contacts, conversations, assignments, messages };
}

module.exports = { createSampleDb };
