const express = require('express');
const { z } = require('zod');
const { eq, desc, sql } = require('drizzle-orm');
const { db, schema } = require('../db');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../utils/http');

const router = express.Router();
const { providers, users, bookings } = schema;
router.use(requireAuth, requireRole('ADMIN'));

router.get('/providers', asyncHandler(async (req, res) => {
  const rows = await db.select({
    id: providers.id, name: users.name, email: users.email, specialty: providers.specialty,
    city: providers.city, experienceYears: providers.experienceYears, feeInr: providers.feeInr,
    verified: providers.verified, createdAt: providers.createdAt,
  }).from(providers).innerJoin(users, eq(users.id, providers.userId))
    .orderBy(providers.verified, desc(providers.createdAt));
  res.json(rows);
}));

const verifySchema = z.object({ verified: z.boolean() });

// Explicit true/false (the old endpoint was called "toggle" but could only ever set true).
router.patch('/providers/:id/verify', validate(verifySchema), asyncHandler(async (req, res) => {
  const [p] = await db.update(providers).set({ verified: req.valid.body.verified })
    .where(eq(providers.id, req.params.id)).returning();
  if (!p) throw new HttpError(404, 'Provider not found');
  res.json(p);
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const [[u], [p], b] = await Promise.all([
    db.select({ patients: sql`count(*) filter (where role = 'PATIENT')::int` }).from(users),
    db.select({
      verified: sql`count(*) filter (where verified)::int`,
      pending: sql`count(*) filter (where not verified)::int`,
    }).from(providers),
    db.select({ status: bookings.status, n: sql`count(*)::int` }).from(bookings).groupBy(bookings.status),
  ]);
  const byStatus = Object.fromEntries(b.map((r) => [r.status, r.n]));
  res.json({ patients: u.patients, doctors: p.verified, pendingDoctors: p.pending, bookings: byStatus });
}));

module.exports = router;
