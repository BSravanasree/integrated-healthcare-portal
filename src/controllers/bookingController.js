const { prisma } = require('../utils/prisma');
const { v4: uuid } = require('uuid');

async function createBooking(req, res, next) {
  try {
    const { providerId, date, timeSlot, notes } = req.body;
    if (!providerId || !date || !timeSlot) return res.status(400).json({ message: 'Missing fields' });
    const provider = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    const id = uuid();
    const booking = await prisma.booking.create({ data: { id, providerId, patientId: req.user.id, date: new Date(date), timeSlot, notes } });
    res.json(booking);
  } catch (err) { next(err); }
}

async function listMyBookings(req, res, next) {
  try {
    const bookings = await prisma.booking.findMany({ where: { patientId: req.user.id } });
    res.json(bookings);
  } catch (err) { next(err); }
}

module.exports = { createBooking, listMyBookings };
