const express = require('express');
const router = express.Router();
const controller = require('../controllers/whatsappConnection.controller');
const { chatSessionAuth, masterKeyAuth } = require('../middlewares/auth');

// Superadmin: master key; Admin cliente: chatSessionAuth (usa clientId en req.user)
router.get('/admin-config', chatSessionAuth, controller.getAdminConfig);
router.put('/admin-config', chatSessionAuth, controller.updateAdminConfig);
router.get('/', chatSessionAuth, controller.list);
router.get('/:id', chatSessionAuth, controller.getOne);
router.post('/', chatSessionAuth, controller.create);
router.put('/:id', chatSessionAuth, controller.update);
router.delete('/:id', chatSessionAuth, controller.remove);

module.exports = router;
