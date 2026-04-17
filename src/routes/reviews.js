const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createReview } = require('../controllers/reviewController');

router.post('/', authMiddleware, createReview);

module.exports = router;
