const express = require('express');
const controller = require('../controllers/crmController');

const router = express.Router();
router.post('/auth/login', controller.login);
router.patch('/users/:id/availability', controller.setAvailability);
router.get('/contacts', controller.getContacts);
router.get('/conversations', controller.getConversations);
router.get('/conversations/feed', controller.getConversationsFeed);
router.get('/conversations/:phone', controller.getConversation);
router.post('/reply', controller.reply);
router.get('/users', controller.getUsers);
router.get('/audit', controller.getAudit);
router.post('/conversations/auto-assign', controller.autoAssign);
router.post('/conversations/:id/take', controller.takeConversation);
router.post('/conversations/:id/transfer', controller.transferConversation);
router.patch('/conversations/:id/meta', controller.updateConversationMeta);
router.patch('/conversations/:id/status', controller.updateCaseStatus);
module.exports = router;
