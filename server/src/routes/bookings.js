const express = require('express');
const { z } = require('zod');
const { and, eq, desc } = require('drizzle-orm');
const { db, schema } = require('../db');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../utils/http');
const { nowParts, addDays, isSlotInFuture, BOOKING_WINDOW_DAYS } = require('../utils/time');

const router = express.Router();
const { bookings, providers } = schema;
router.use(requireAuth);

const createSchema = z.object({
  providerId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  timeSlot: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'timeSlot must be HH:MM'),
  reason: z.string().trim().max(500).optional(),
});

router.post('/', requireRole('PATIENT'), validate(createSchema), asyncHandler(async (req, res) => {
  const { providerId, date, timeSlot, reason } = req.valid.body;
  const provider = await db.query.providers.findFirst({ where: and(eq(providers.id, providerId), eq(providers.verified, true)) });
  if (!provider) throw new HttpError(404, 'Doctor not found');
  if (!provider.slotTimes.includes(timeSlot)) throw new HttpError(400, 'The doctor does not offer that time slot');
  const today = nowParts().date;
  if (date > addDays(today, BOOKING_WINDOW_DAYS)) throw new HttpError(400, `You can book up to ${BOOKING_WINDOW_DAYS} days ahead`);
  if (!isSlotInFuture(date, timeSlot)) throw new HttpError(400, 'That slot is in the past');

  // No read-then-write check here: the partial unique index on (provider, date, slot)
  // is the single source of truth, so two simultaneous requests can't both succeed.
  // A conflict surfaces as Postgres error 23505 -> HTTP 409 in the error handler.
  const [booking] = await db.insert(bookings)
    .values({ providerId, patientId: req.user.id, date, timeSlot, reason }).returning();
  res.status(201).json(booking);
}));

const withRelations = {
  provider: { columns: { id: true, specialty: true, city: true, feeInr: true }, with: { user: { columns: { name: true } } } },
  patient: { columns: { id: true, name: true } },
  review: { columns: { id: true, rating: true } },
};

const shape = (b) => ({
  id: b.id, date: b.date, timeSlot: b.timeSlot, status: b.status, reason: b.reason,
  consultNotes: b.consultNotes, createdAt: b.createdAt,
  provider: { id: b.provider.id, name: b.provider.user.name, specialty: b.provider.specialty, city: b.provider.city, feeInr: b.provider.feeInr },
  patient: b.patient,
  review: b.review,
});

// Role-aware: patients see their appointments, doctors see appointments booked with them.
router.get('/mine', asyncHandler(async (req, res) => {
  let where;
  if (req.user.role === 'PATIENT') where = eq(bookings.patientId, req.user.id);
  else if (req.user.role === 'PROVIDER' && req.user.provider) where = eq(bookings.providerId, req.user.provider.id);
  else return res.json([]);
  const rows = await db.query.bookings.findMany({
    where, with: withRelations, orderBy: [desc(bookings.date), desc(bookings.timeSlot)], limit: 200,
  });
  res.json(rows.map(shape));
}));

/** Load a booking and make sure the current user is its patient or its doctor. */
async function loadOwnBooking(req) {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) throw new HttpError(400, 'Invalid booking id');
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, parsed.data), with: withRelations });
  if (!b) throw new HttpError(404, 'Booking not found');
  const isPatient = b.patientId === req.user.id;
  const isDoctor = req.user.provider && b.providerId === req.user.provider.id;
  // 404 rather than 403 so we don't reveal that someone else's booking exists.
  if (!isPatient && !isDoctor) throw new HttpError(404, 'Booking not found');
  return { b, isPatient, isDoctor };
}

router.get('/:id', asyncHandler(async (req, res) => {
  const { b } = await loadOwnBooking(req);
  res.json(shape(b));
}));

router.patch('/:id/cancel', asyncHandler(async (req, res) => {
  const { b } = await loadOwnBooking(req);
  if (b.status !== 'BOOKED') throw new HttpError(409, `Cannot cancel a ${b.status.toLowerCase()} booking`);
  // Conditional update guards against a concurrent status change.
  const [updated] = await db.update(bookings).set({ status: 'CANCELLED' })
    .where(and(eq(bookings.id, b.id), eq(bookings.status, 'BOOKED'))).returning();
  if (!updated) throw new HttpError(409, 'Booking status changed, please refresh');
  res.json(updated);
}));

const completeSchema = z.object({ consultNotes: z.string().trim().max(4000).optional() });

router.patch('/:id/complete', requireRole('PROVIDER'), validate(completeSchema), asyncHandler(async (req, res) => {
  const { b, isDoctor } = await loadOwnBooking(req);
  if (!isDoctor) throw new HttpError(403, 'Only the doctor can complete a consultation');
  if (b.status !== 'BOOKED') throw new HttpError(409, `Cannot complete a ${b.status.toLowerCase()} booking`);
  const [updated] = await db.update(bookings)
    .set({ status: 'COMPLETED', consultNotes: req.valid.body.consultNotes })
    .where(and(eq(bookings.id, b.id), eq(bookings.status, 'BOOKED'))).returning();
  if (!updated) throw new HttpError(409, 'Booking status changed, please refresh');
  res.json(updated);
}));

module.exports = { router, loadOwnBooking };
