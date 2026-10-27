const express = require('express');
const { z } = require('zod');
const { eq, avg, count } = require('drizzle-orm');
const { db, schema } = require('../db');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../utils/http');

const router = express.Router();
const { reviews, bookings, providers } = schema;

const createSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.coerce.number().int().min(1, 'Rating must be 1-5').max(5, 'Rating must be 1-5'),
  comment: z.string().trim().max(1000).optional(),
});

// Only a patient with a COMPLETED consultation can review, once per booking.
router.post('/', requireAuth, requireRole('PATIENT'), validate(createSchema), asyncHandler(async (req, res) => {
  const { bookingId, rating, comment } = req.valid.body;
  const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!booking || booking.patientId !== req.user.id) throw new HttpError(404, 'Booking not found');
  if (booking.status !== 'COMPLETED') throw new HttpError(400, 'You can review a doctor after your consultation is completed');

  // Insert + recompute the denormalised rating in ONE transaction so the
  // provider's average can never drift from the reviews table.
  const review = await db.transaction(async (tx) => {
    const [r] = await tx.insert(reviews).values({
      bookingId, providerId: booking.providerId, patientId: req.user.id, rating, comment,
    }).returning();
    // Lock the provider row so concurrent reviews recompute serially.
    await tx.select({ id: providers.id }).from(providers).where(eq(providers.id, booking.providerId)).for('update');
    const [stats] = await tx.select({ avg: avg(reviews.rating), n: count() })
      .from(reviews).where(eq(reviews.providerId, booking.providerId));
    await tx.update(providers).set({
      rating: Math.round(Number(stats.avg || 0) * 10) / 10,
      reviewsCount: Number(stats.n),
    }).where(eq(providers.id, booking.providerId));
    return r;
  });
  res.status(201).json(review);
}));

module.exports = router;
