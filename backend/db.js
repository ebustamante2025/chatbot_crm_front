const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSampleDb } = require('./sample-data');

const dbPath = path.join(__dirname, '..', 'crm-data.json');
const CASE_STATUSES = ['SIN_TOMAR_CASO', 'TOMADO_CASO', 'ATENDIENDO', 'REVISADO', 'TERMINADO'];
const ACTIVE_CASE_STATUSES = new Set(['TOMADO_CASO', 'ATENDIENDO', 'REVISADO']);
const PRIORITIES = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];

function ensureDb() {
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify(createSampleDb(), null, 2), 'utf8');
}
function nowIso() { return new Date().toISOString(); }
function writeDb(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8'); }
function readDb() { ensureDb(); return JSON.parse(fs.readFileSync(dbPath, 'utf8') || '{}'); }
function nextId(items) { return items.length ? Math.max(...items.map((i) => Number(i.id) || 0)) + 1 : 1; }
function hashPassword(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

function normalizeConversation(db, c) {
  const contact = db.contacts.find((ct) => ct.id === c.contact_id) || null;
  const assignee = db.users.find((u) => u.id === c.current_assigned_user_id) || null;
  return {
    ...c,
    channel: c.channel || 'WHATSAPP',
    priority: c.priority || 'MEDIA',
    tags: Array.isArray(c.tags) ? c.tags : [],
    internal_notes: c.internal_notes || '',
    contact_phone: contact?.phone || null,
    contact_name: contact?.name || null,
    assigned_user_name: assignee?.full_name || null
  };
}

async function authenticateUser({ email, password }) {
  const db = readDb();
  const user = db.users.find((u) => u.is_active && String(u.email).toLowerCase() === String(email).toLowerCase());
  if (!user) throw new Error('Credenciales invalidas');

  const matchesHash = user.password_hash && user.password_hash === hashPassword(password);
  const matchesLegacy = user.password && user.password === password;
  if (!matchesHash && !matchesLegacy) throw new Error('Credenciales invalidas');

  if (!user.password_hash) {
    user.password_hash = hashPassword(password);
    delete user.password;
    writeDb(db);
  }

  return { id: user.id, full_name: user.full_name, email: user.email, role: user.role, availability_status: user.availability_status };
}

async function updateUserAvailability({ userId, availabilityStatus }) {
  if (!['DISPONIBLE', 'AUSENTE'].includes(availabilityStatus)) {
    throw new Error('Estado de disponibilidad no valido');
  }
  const db = readDb();
  const user = db.users.find((u) => u.id === Number(userId) && u.is_active);
  if (!user) throw new Error('Usuario no encontrado');
  user.availability_status = availabilityStatus;
  writeDb(db);
  return { id: user.id, full_name: user.full_name, email: user.email, role: user.role, availability_status: user.availability_status };
}

function findContactByPhone(db, phone) { return db.contacts.find((c) => c.phone === phone) || null; }
function findOrCreateContact(db, phone, name) {
  const current = findContactByPhone(db, phone);
  if (current) {
    current.name = name || current.name || phone;
    current.last_message_at = nowIso();
    return current;
  }
  const contact = { id: nextId(db.contacts), phone, name: name || phone, created_at: nowIso(), last_message_at: nowIso() };
  db.contacts.push(contact);
  return contact;
}
function getOpenConversationByContact(db, contactId) {
  const allowed = new Set(['SIN_TOMAR_CASO', 'TOMADO_CASO', 'ATENDIENDO', 'REVISADO']);
  return db.conversations
    .filter((c) => c.contact_id === contactId && allowed.has(c.case_status))
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0] || null;
}
function createConversationForContact(db, contactId) {
  const conversation = {
    id: nextId(db.conversations),
    contact_id: contactId,
    case_status: 'SIN_TOMAR_CASO',
    current_assigned_user_id: null,
    channel: 'WHATSAPP',
    priority: 'MEDIA',
    tags: [],
    internal_notes: '',
    created_at: nowIso(),
    updated_at: nowIso(),
    closed_at: null
  };
  db.conversations.push(conversation);
  return conversation;
}

function addAudit(db, payload) {
  db.assignments.push({ id: nextId(db.assignments), created_at: nowIso(), ...payload });
}

async function getContacts() {
  const db = readDb();
  return db.contacts
    .map((contact) => {
      const convo = db.conversations.filter((c) => c.contact_id === contact.id).sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0] || null;
      return { id: contact.id, phone: contact.phone, name: contact.name, last_message_at: contact.last_message_at, created_at: contact.created_at, conversation_id: convo?.id || null, case_status: convo?.case_status || 'SIN_TOMAR_CASO', current_assigned_user_id: convo?.current_assigned_user_id || null };
    })
    .sort((a, b) => new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime());
}

async function listConversations() {
  const db = readDb();
  return db.conversations.map((c) => normalizeConversation(db, c)).sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
}

async function listConversationsFeed({ role, userId }) {
  const db = readDb();
  const sortedOldest = [...db.conversations].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (role === 'ADMIN' || role === 'SUPERVISOR') return sortedOldest.map((c) => normalizeConversation(db, c));

  if (role === 'ASESOR') {
    const user = db.users.find((u) => u.id === Number(userId));
    const isAvailable = user?.availability_status === 'DISPONIBLE';
    if (!isAvailable) return [];
    const advisorId = Number(userId);
    let takenByMe = sortedOldest.filter((c) => c.current_assigned_user_id === advisorId && ACTIVE_CASE_STATUSES.has(c.case_status));

    // Autoasigna los casos mas antiguos hasta completar 2 chats activos del asesor disponible.
    if (takenByMe.length < 2) {
      const toAssign = sortedOldest
        .filter((c) => c.case_status === 'SIN_TOMAR_CASO' && c.current_assigned_user_id == null)
        .slice(0, 2 - takenByMe.length);

      if (toAssign.length > 0) {
        for (const conversation of toAssign) {
          const fromStatus = conversation.case_status;
          conversation.current_assigned_user_id = advisorId;
          conversation.case_status = 'TOMADO_CASO';
          conversation.updated_at = nowIso();
          addAudit(db, {
            conversation_id: conversation.id,
            user_id: advisorId,
            action: 'AUTO_ASIGNAR_ASESOR',
            from_status: fromStatus,
            to_status: conversation.case_status
          });
        }
        writeDb(db);
        takenByMe = [...db.conversations]
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .filter((c) => c.current_assigned_user_id === advisorId && ACTIVE_CASE_STATUSES.has(c.case_status));
      }
    }

    return takenByMe.slice(0, 2).map((c) => normalizeConversation(db, c));
  }

  return [];
}

async function getMessagesByPhone(phone) {
  const db = readDb();
  const contact = findContactByPhone(db, phone);
  if (!contact) return [];
  const conversation = getOpenConversationByContact(db, contact.id) || db.conversations.filter((c) => c.contact_id === contact.id).sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0];
  if (!conversation) return [];
  return db.messages.filter((m) => m.conversation_id === conversation.id).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

async function upsertContact(phone, name) { const db = readDb(); findOrCreateContact(db, phone, name); writeDb(db); }

async function addMessage({ phone, direction, text, whatsapp_message_id = null }) {
  const db = readDb();
  const contact = findOrCreateContact(db, phone, phone);
  const conversation = getOpenConversationByContact(db, contact.id) || createConversationForContact(db, contact.id);
  const message = { id: nextId(db.messages), conversation_id: conversation.id, phone, direction, text, whatsapp_message_id, message_status: direction === 'outbound' ? 'ENVIADO' : 'RECIBIDO', created_at: nowIso() };
  db.messages.push(message);
  conversation.updated_at = message.created_at;
  contact.last_message_at = message.created_at;
  writeDb(db);
  return message;
}

async function listUsers() {
  const db = readDb();
  return db.users.filter((u) => u.is_active).map((u) => ({
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    role: u.role,
    availability_status: u.availability_status,
    is_active: u.is_active,
    active_conversations: db.conversations.filter((c) => c.current_assigned_user_id === u.id && ACTIVE_CASE_STATUSES.has(c.case_status)).length
  }));
}

function assertCanHandleNewCase(db, userId) {
  const user = db.users.find((u) => u.id === Number(userId) && u.is_active);
  if (!user) throw new Error('Usuario no disponible');
  if (user.availability_status !== 'DISPONIBLE') throw new Error('El asesor no esta disponible para tomar nuevos chats');
  const activeCount = db.conversations.filter((c) => c.current_assigned_user_id === user.id && ACTIVE_CASE_STATUSES.has(c.case_status)).length;
  if (activeCount >= 2) throw new Error('El asesor ya tiene 2 conversaciones activas');
  return user;
}

async function takeConversation({ conversationId, userId }) {
  const db = readDb();
  const conversation = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conversation) throw new Error('Conversacion no encontrada');

  const user = db.users.find((u) => u.id === Number(userId) && u.is_active);
  if (!user) throw new Error('Usuario no disponible');
  if (user.availability_status !== 'DISPONIBLE') throw new Error('El asesor no esta disponible para tomar nuevos chats');

  if (conversation.current_assigned_user_id && conversation.current_assigned_user_id !== user.id && conversation.case_status !== 'TERMINADO') {
    throw new Error('La conversacion ya esta asignada a otro asesor');
  }

  const activeCount = db.conversations.filter((c) => c.current_assigned_user_id === user.id && ACTIVE_CASE_STATUSES.has(c.case_status)).length;
  if (activeCount >= 2 && conversation.current_assigned_user_id !== user.id) throw new Error('El asesor ya tiene 2 conversaciones activas');

  const fromStatus = conversation.case_status;
  conversation.current_assigned_user_id = user.id;
  conversation.case_status = 'TOMADO_CASO';
  conversation.updated_at = nowIso();

  addAudit(db, {
    conversation_id: conversation.id,
    user_id: user.id,
    action: 'TOMAR',
    from_status: fromStatus,
    to_status: conversation.case_status
  });
  writeDb(db);
  return normalizeConversation(db, conversation);
}

async function transferConversation({ conversationId, fromUserId = null, toUserId, byRole = '' }) {
  const db = readDb();
  const conversation = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conversation) throw new Error('Conversacion no encontrada');

  const toUser = db.users.find((u) => u.id === Number(toUserId) && u.is_active);
  if (!toUser) throw new Error('Trabajador destino no encontrado');
  if (String(toUser.role).toUpperCase() !== 'ASESOR') throw new Error('Solo se puede transferir a usuarios ASESOR');

  const currentAssigneeId = conversation.current_assigned_user_id ? Number(conversation.current_assigned_user_id) : null;
  const roleUpper = String(byRole || '').toUpperCase();
  const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'SUPERVISOR';
  const isOwner = fromUserId && currentAssigneeId === Number(fromUserId);

  if (!isAdmin && !isOwner) throw new Error('No tienes permiso para transferir esta conversacion');
  if (currentAssigneeId === toUser.id) return normalizeConversation(db, conversation);

  assertCanHandleNewCase(db, toUser.id);

  const fromStatus = conversation.case_status;
  conversation.current_assigned_user_id = toUser.id;
  if (conversation.case_status === 'SIN_TOMAR_CASO') conversation.case_status = 'TOMADO_CASO';
  conversation.updated_at = nowIso();

  addAudit(db, {
    conversation_id: conversation.id,
    user_id: toUser.id,
    action: 'TRANSFERIR',
    from_status: fromStatus,
    to_status: conversation.case_status,
    meta: { from_user_id: fromUserId ? Number(fromUserId) : null, to_user_id: toUser.id }
  });

  writeDb(db);
  return normalizeConversation(db, conversation);
}

async function autoAssignNextCase({ userId }) {
  const db = readDb();
  const requester = db.users.find((u) => u.id === Number(userId) && u.is_active);
  if (!requester) throw new Error('Usuario no valido');

  const pending = [...db.conversations]
    .filter((c) => c.case_status === 'SIN_TOMAR_CASO')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  if (!pending.length) throw new Error('No hay casos disponibles por asignar');

  const advisors = db.users
    .filter((u) => u.is_active && String(u.role).toUpperCase() === 'ASESOR' && u.availability_status === 'DISPONIBLE')
    .map((u) => ({
      user: u,
      active: db.conversations.filter((c) => c.current_assigned_user_id === u.id && ACTIVE_CASE_STATUSES.has(c.case_status)).length
    }))
    .filter((x) => x.active < 2)
    .sort((a, b) => a.active - b.active || a.user.id - b.user.id);

  if (!advisors.length) throw new Error('No hay asesores disponibles para autoasignar');

  const target = advisors[0].user;
  const conversation = pending[0];
  const fromStatus = conversation.case_status;

  conversation.current_assigned_user_id = target.id;
  conversation.case_status = 'TOMADO_CASO';
  conversation.updated_at = nowIso();

  addAudit(db, {
    conversation_id: conversation.id,
    user_id: requester.id,
    action: 'AUTO_ASIGNAR',
    from_status: fromStatus,
    to_status: conversation.case_status,
    meta: { assigned_to: target.id }
  });

  writeDb(db);
  return normalizeConversation(db, conversation);
}

async function updateConversationMeta({ conversationId, userId = null, role = '', tags = null, internalNotes = null, priority = null }) {
  const db = readDb();
  const conversation = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conversation) throw new Error('Conversacion no encontrada');

  const roleUpper = String(role).toUpperCase();
  const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'SUPERVISOR';
  const isOwner = userId && conversation.current_assigned_user_id === Number(userId);
  if (!isAdmin && !isOwner) throw new Error('Sin permisos para editar notas/etiquetas');

  if (tags !== null) {
    conversation.tags = Array.isArray(tags)
      ? tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 12)
      : [];
  }
  if (internalNotes !== null) {
    conversation.internal_notes = String(internalNotes || '').slice(0, 1500);
  }
  if (priority !== null) {
    const p = String(priority).toUpperCase();
    if (!PRIORITIES.includes(p)) throw new Error(`Prioridad invalida. Usa: ${PRIORITIES.join(', ')}`);
    conversation.priority = p;
  }

  conversation.updated_at = nowIso();
  addAudit(db, {
    conversation_id: conversation.id,
    user_id: userId ? Number(userId) : conversation.current_assigned_user_id,
    action: 'EDITAR_META',
    from_status: conversation.case_status,
    to_status: conversation.case_status
  });
  writeDb(db);
  return normalizeConversation(db, conversation);
}

async function listAudit({ conversationId = null, limit = 300 }) {
  const db = readDb();
  const max = Math.min(Math.max(Number(limit) || 100, 1), 1000);
  const userMap = new Map(db.users.map((u) => [u.id, u.full_name]));

  return db.assignments
    .filter((a) => (conversationId ? a.conversation_id === Number(conversationId) : true))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, max)
    .map((a) => ({ ...a, user_name: userMap.get(a.user_id) || 'Sistema' }));
}

async function updateConversationCaseStatus({ conversationId, userId = null, role = '', caseStatus }) {
  if (!CASE_STATUSES.includes(caseStatus)) throw new Error(`Estado no valido. Usa: ${CASE_STATUSES.join(', ')}`);
  const db = readDb();
  const conversation = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conversation) throw new Error('Conversacion no encontrada');

  const roleUpper = String(role).toUpperCase();
  const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'SUPERVISOR';
  const isOwner = userId && conversation.current_assigned_user_id === Number(userId);

  if (!isAdmin && !isOwner) throw new Error('No tienes permisos para cambiar el estado de este chat');

  const fromStatus = conversation.case_status;
  conversation.case_status = caseStatus;
  if (caseStatus === 'TERMINADO') conversation.closed_at = nowIso();
  conversation.updated_at = nowIso();

  addAudit(db, {
    conversation_id: conversation.id,
    user_id: userId ? Number(userId) : conversation.current_assigned_user_id,
    action: 'CAMBIO_ESTADO',
    from_status: fromStatus,
    to_status: caseStatus
  });
  writeDb(db);
  return normalizeConversation(db, conversation);
}

module.exports = {
  CASE_STATUSES,
  PRIORITIES,
  authenticateUser,
  updateUserAvailability,
  getContacts,
  upsertContact,
  getMessagesByPhone,
  addMessage,
  listUsers,
  listConversations,
  listConversationsFeed,
  takeConversation,
  transferConversation,
  autoAssignNextCase,
  updateConversationMeta,
  listAudit,
  updateConversationCaseStatus
};
