const {
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
} = require('../db');

async function listContacts() { return getContacts(); }
async function listConversationByPhone(phone) { return getMessagesByPhone(phone); }
async function saveOutboundMessage({ phone, text, whatsappMessageId }) {
  await upsertContact(phone, phone);
  await addMessage({ phone, direction: 'outbound', text, whatsapp_message_id: whatsappMessageId });
}
async function saveInboundMessage({ phone, name, text, whatsappMessageId }) {
  await upsertContact(phone, name);
  await addMessage({ phone, direction: 'inbound', text, whatsapp_message_id: whatsappMessageId });
}

module.exports = {
  CASE_STATUSES,
  PRIORITIES,
  authenticateUser,
  updateUserAvailability,
  listContacts,
  listConversationByPhone,
  saveOutboundMessage,
  saveInboundMessage,
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
