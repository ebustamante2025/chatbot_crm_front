const express = require('express');
const controller = require('../controllers/crmController');

const router = express.Router();
router.get('/whatsapp', controller.verifyWebhook);
router.post('/whatsapp', controller.receiveWebhook);
module.exports = router;
