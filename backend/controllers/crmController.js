const config = require('../config');
const { sendWhatsAppText } = require('../whatsapp');
const crmModel = require('../models/crmModel');

const loginAttempts = new Map();

function canAttemptLogin(key) {
  const now = Date.now();
  const row = loginAttempts.get(key) || { count: 0, blockedUntil: 0 };
  if (row.blockedUntil > now) return { ok: false, waitMs: row.blockedUntil - now };
  return { ok: true, waitMs: 0 };
}

function registerLoginFail(key) {
  const now = Date.now();
  const row = loginAttempts.get(key) || { count: 0, blockedUntil: 0 };
  row.count += 1;
  if (row.count >= 5) {
    row.blockedUntil = now + 5 * 60 * 1000;
    row.count = 0;
  }
  loginAttempts.set(key, row);
}

function registerLoginSuccess(key) {
  loginAttempts.delete(key);
}

async function login(req, res) {
  try {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'email y password son obligatorios' });

    const key = `${req.ip}:${email.toLowerCase()}`;
    const guard = canAttemptLogin(key);
    if (!guard.ok) {
      return res.status(429).json({ error: `Demasiados intentos. Intenta en ${Math.ceil(guard.waitMs / 1000)}s` });
    }

    const user = await crmModel.authenticateUser({ email, password });
    registerLoginSuccess(key);
    return res.json({ ok: true, user });
  } catch (error) {
    const email = String(req.body?.email || '').trim().toLowerCase();
    registerLoginFail(`${req.ip}:${email}`);
    return res.status(401).json({ error: error.message });
  }
}

async function setAvailability(req, res) {
  try {
    const userId = Number(req.params.id);
    const availabilityStatus = String(req.body?.availability_status || '').trim().toUpperCase();
    if (!userId || !availabilityStatus) return res.status(400).json({ error: 'user id y availability_status son obligatorios' });
    const user = await crmModel.updateUserAvailability({ userId, availabilityStatus });
    return res.json({ ok: true, user });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function getContacts(_req, res) { try { res.json(await crmModel.listContacts()); } catch (error) { res.status(500).json({ error: error.message }); } }
async function getConversation(req, res) { try { res.json(await crmModel.listConversationByPhone(req.params.phone)); } catch (error) { res.status(500).json({ error: error.message }); } }

async function reply(req, res) {
  try {
    const to = String(req.body?.to || '').trim();
    const text = String(req.body?.text || '').trim();
    if (!to || !text) return res.status(400).json({ error: 'to y text son obligatorios' });

    const response = await sendWhatsAppText(to, text);
    const whatsappMessageId = response?.messages?.[0]?.id || null;
    await crmModel.saveOutboundMessage({ phone: to, text, whatsappMessageId });
    return res.json({ ok: true, response });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getUsers(_req, res) { try { res.json(await crmModel.listUsers()); } catch (error) { res.status(500).json({ error: error.message }); } }
async function getConversations(_req, res) { try { res.json(await crmModel.listConversations()); } catch (error) { res.status(500).json({ error: error.message }); } }

async function getConversationsFeed(req, res) {
  try {
    const role = String(req.query.role || '').toUpperCase();
    const userId = Number(req.query.user_id || 0);
    if (!role) return res.status(400).json({ error: 'role es obligatorio' });
    res.json(await crmModel.listConversationsFeed({ role, userId }));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function takeConversation(req, res) {
  try {
    const conversationId = Number(req.params.id);
    const userId = Number(req.body?.user_id);
    if (!conversationId || !userId) return res.status(400).json({ error: 'conversation id y user_id son obligatorios' });
    const conversation = await crmModel.takeConversation({ conversationId, userId });
    return res.json({ ok: true, conversation });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function transferConversation(req, res) {
  try {
    const conversationId = Number(req.params.id);
    const fromUserId = req.body?.from_user_id ? Number(req.body.from_user_id) : null;
    const toUserId = Number(req.body?.to_user_id);
    const byRole = String(req.body?.by_role || '').toUpperCase();
    if (!conversationId || !toUserId || !byRole) {
      return res.status(400).json({ error: 'conversation id, to_user_id y by_role son obligatorios' });
    }

    const conversation = await crmModel.transferConversation({ conversationId, fromUserId, toUserId, byRole });
    return res.json({ ok: true, conversation });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function autoAssign(req, res) {
  try {
    const userId = Number(req.body?.user_id || 0);
    if (!userId) return res.status(400).json({ error: 'user_id es obligatorio' });
    const conversation = await crmModel.autoAssignNextCase({ userId });
    return res.json({ ok: true, conversation });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function updateConversationMeta(req, res) {
  try {
    const conversationId = Number(req.params.id);
    const userId = req.body?.user_id ? Number(req.body.user_id) : null;
    const role = String(req.body?.role || '').toUpperCase();
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : null;
    const internalNotes = req.body?.internal_notes !== undefined ? String(req.body.internal_notes || '') : null;
    const priority = req.body?.priority !== undefined ? String(req.body.priority || '') : null;

    if (!conversationId || !role) return res.status(400).json({ error: 'conversation id y role son obligatorios' });

    const conversation = await crmModel.updateConversationMeta({ conversationId, userId, role, tags, internalNotes, priority });
    return res.json({ ok: true, conversation, valid_priorities: crmModel.PRIORITIES });
  } catch (error) {
    return res.status(400).json({ error: error.message, valid_priorities: crmModel.PRIORITIES });
  }
}

async function getAudit(req, res) {
  try {
    const conversationId = req.query.conversation_id ? Number(req.query.conversation_id) : null;
    const limit = req.query.limit ? Number(req.query.limit) : 300;
    const data = await crmModel.listAudit({ conversationId, limit });
    return res.json(data);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function updateCaseStatus(req, res) {
  try {
    const conversationId = Number(req.params.id);
    const caseStatus = String(req.body?.case_status || '').trim();
    const userId = req.body?.user_id ? Number(req.body.user_id) : null;
    const role = String(req.body?.role || '').toUpperCase();
    if (!conversationId || !caseStatus) return res.status(400).json({ error: 'conversation id y case_status son obligatorios' });

    const conversation = await crmModel.updateConversationCaseStatus({ conversationId, userId, role, caseStatus });
    return res.json({ ok: true, conversation, valid_statuses: crmModel.CASE_STATUSES });
  } catch (error) {
    return res.status(400).json({ error: error.message, valid_statuses: crmModel.CASE_STATUSES });
  }
}

function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.verifyToken) return res.status(200).send(challenge);
  return res.status(403).send('Forbidden');
}

async function receiveWebhook(req, res) {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const contacts = value?.contacts || [];
    const messages = value?.messages || [];
    const profileByWaId = new Map(contacts.filter((contact) => contact?.wa_id).map((contact) => [contact.wa_id, contact?.profile?.name || contact.wa_id]));

    for (const msg of messages) {
      const phone = msg?.from;
      if (!phone) continue;
      const name = profileByWaId.get(phone) || phone;
      const text = msg?.text?.body || `[${msg.type || 'unknown'}]`;
      await crmModel.saveInboundMessage({ phone, name, text, whatsappMessageId: msg.id || null });
    }

    return res.sendStatus(200);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

function health(_req, res) { res.json({ ok: true, service: 'whatsapp-crm' }); }

module.exports = {
  login,
  setAvailability,
  getContacts,
  getConversation,
  reply,
  getUsers,
  getConversations,
  getConversationsFeed,
  takeConversation,
  transferConversation,
  autoAssign,
  updateConversationMeta,
  getAudit,
  updateCaseStatus,
  verifyWebhook,
  receiveWebhook,
  health
};
