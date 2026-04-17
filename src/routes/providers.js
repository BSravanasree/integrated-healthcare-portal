const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const { listProviders, createProvider, getProvider, toggleVerify } = require('../controllers/providerController');

router.get('/', listProviders);
router.post('/', authMiddleware, requireRole('PROVIDER'), createProvider);
router.get('/:id', getProvider);
router.post('/:id/toggle-verify', authMiddleware, requireRole('ADMIN'), toggleVerify);

module.exports = router;
