const express = require('express');
const { z } = require('zod');
const { and, eq, ne, ilike, or, desc, sql } = require('drizzle-orm');
const { db, schema } = require('../db');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../utils/http');
const { nowParts, addDays, isSlotInFuture, BOOKING_WINDOW_DAYS } = require('../utils/time');

const router = express.Router();
const { providers, users, reviews, bookings } = schema;

const providerColumns = {
  id: providers.id,
  name: users.name,
  specialty: providers.specialty,
  bio: providers.bio,
  city: providers.city,
  languages: providers.languages,
  experienceYears: providers.experienceYears,
  feeInr: providers.feeInr,
  rating: providers.rating,
  reviewsCount: providers.reviewsCount,
  verified: providers.verified,
};

const listQuery = z.object({
  q: z.string().trim().max(60).optional(),
  specialty: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

// Public search: only admin-verified doctors are listed.
router.get('/', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const { q, specialty, city, page, limit } = req.valid.query;
  const filters = [eq(providers.verified, true)];
  if (q) filters.push(or(ilike(users.name, `%${q}%`), ilike(providers.specialty, `%${q}%`)));
  if (specialty) filters.push(eq(providers.specialty, specialty));
  if (city) filters.push(ilike(providers.city, city));
  const where = and(...filters);

  const [items, [{ count }]] = await Promise.all([
    db.select(providerColumns).from(providers).innerJoin(users, eq(users.id, providers.userId))
      .where(where).orderBy(desc(providers.rating), desc(providers.reviewsCount), users.name)
      .limit(limit).offset((page - 1) * limit),
    db.select({ count: sql`count(*)::int` }).from(providers)
      .innerJoin(users, eq(users.id, providers.userId)).where(where),
  ]);
  res.json({ items, page, limit, total: count, totalPages: Math.ceil(count / limit) });
}));

router.get('/filters', asyncHandler(async (req, res) => {
  const rows = await db.selectDistinct({ specialty: providers.specialty, city: providers.city })
    .from(providers).where(eq(providers.verified, true));
  res.json({
    specialties: [...new Set(rows.map((r) => r.specialty))].sort(),
    cities: [...new Set(rows.map((r) => r.city).filter(Boolean))].sort(),
  });
}));

const updateMeSchema = z.object({
  specialty: z.string().trim().min(2).max(60).optional(),
  city: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(1000).optional(),
  feeInr: z.coerce.number().int().min(0).max(100000).optional(),
  experienceYears: z.coerce.number().int().min(0).max(70).optional(),
  languages: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  slotTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Slots must be HH:MM')).min(1).max(48).optional(),
});

router.get('/me', requireAuth, requireRole('PROVIDER'), asyncHandler(async (req, res) => {
  const [p] = await db.select({ ...providerColumns, slotTimes: providers.slotTimes })
    .from(providers).innerJoin(users, eq(users.id, providers.userId))
    .where(eq(providers.userId, req.user.id));
  if (!p) throw new HttpError(404, 'Provider profile not found');
  res.json(p);
}));

router.patch('/me', requireAuth, requireRole('PROVIDER'), validate(updateMeSchema), asyncHandler(async (req, res) => {
  const data = { ...req.valid.body };
  if (data.slotTimes) data.slotTimes = [...new Set(data.slotTimes)].sort();
  const [p] = await db.update(providers).set(data).where(eq(providers.userId, req.user.id)).returning();
  if (!p) throw new HttpError(404, 'Provider profile not found');
  res.json(p);
}));

async function getVerifiedProvider(id) {
  const [p] = await db.select({ ...providerColumns, slotTimes: providers.slotTimes })
    .from(providers).innerJoin(users, eq(users.id, providers.userId))
    .where(and(eq(providers.id, id), eq(providers.verified, true)));
  if (!p) throw new HttpError(404, 'Doctor not found');
  return p;
}

const idParam = z.object({ id: z.string().uuid('Invalid id') });

router.get('/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const provider = await getVerifiedProvider(req.valid.params.id);
  const recentReviews = await db.select({
    id: reviews.id, rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt,
    patientName: users.name,
  }).from(reviews).innerJoin(users, eq(users.id, reviews.patientId))
    .where(eq(reviews.providerId, provider.id)).orderBy(desc(reviews.createdAt)).limit(20);
  // Only show patients' first names publicly.
  const safeReviews = recentReviews.map((r) => ({ ...r, patientName: r.patientName.split(' ')[0] }));
  delete provider.slotTimes;
  res.json({ provider, reviews: safeReviews });
}));

const slotsQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD') });

router.get('/:id/slots', validate(idParam, 'params'), validate(slotsQuery, 'query'), asyncHandler(async (req, res) => {
  const { date } = req.valid.query;
  const provider = await getVerifiedProvider(req.valid.params.id);
  const today = nowParts().date;
  if (date < today || date > addDays(today, BOOKING_WINDOW_DAYS)) {
    return res.json({ date, slots: [] });
  }
  const taken = await db.select({ timeSlot: bookings.timeSlot }).from(bookings)
    .where(and(eq(bookings.providerId, provider.id), eq(bookings.date, date), ne(bookings.status, 'CANCELLED')));
  const takenSet = new Set(taken.map((t) => t.timeSlot));
  const slots = provider.slotTimes.map((time) => ({
    time,
    available: !takenSet.has(time) && isSlotInFuture(date, time),
  }));
  res.json({ date, slots });
}));

module.exports = router;
