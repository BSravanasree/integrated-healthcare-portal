const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createBooking, listMyBookings } = require('../controllers/bookingController');

router.post('/', authMiddleware, createBooking);
router.get('/mine', authMiddleware, listMyBookings);

module.exports = router;
