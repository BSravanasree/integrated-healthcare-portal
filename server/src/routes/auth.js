const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { eq } = require('drizzle-orm');
const { db, schema } = require('../db');
const { validate } = require('../middleware/validate');
const { requireAuth, signToken } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../utils/http');

const router = express.Router();
const SALT_ROUNDS = 10;

const providerFields = z.object({
  specialty: z.string().trim().min(2).max(60),
  city: z.string().trim().max(60).optional(),
  feeInr: z.coerce.number().int().min(0).max(100000).default(0),
  experienceYears: z.coerce.number().int().min(0).max(70).default(0),
  bio: z.string().trim().max(1000).optional(),
  languages: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  // ADMIN can never be self-assigned; the old API trusted this field blindly.
  role: z.enum(['PATIENT', 'PROVIDER']).default('PATIENT'),
  provider: providerFields.optional(),
}).refine((d) => d.role !== 'PROVIDER' || d.provider, {
  message: 'Doctor details are required to register as a provider', path: ['provider'],
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const profileOf = (user, provider) => ({
  id: user.id, name: user.name, email: user.email, role: user.role,
  provider: provider ? { id: provider.id, verified: provider.verified } : null,
});

router.post('/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const { name, email, password, role, provider } = req.valid.body;
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) throw new HttpError(409, 'Email already registered');

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  // User + provider profile are created atomically.
  const { user, providerRow } = await db.transaction(async (tx) => {
    const [u] = await tx.insert(schema.users).values({ name, email, passwordHash, role }).returning();
    let p = null;
    if (role === 'PROVIDER') {
      [p] = await tx.insert(schema.providers).values({ ...provider, userId: u.id }).returning();
    }
    return { user: u, providerRow: p };
  });
  res.status(201).json({ token: signToken(user), profile: profileOf(user, providerRow) });
}));

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email), with: { provider: true } });
  // Same message for unknown email and wrong password, so accounts can't be enumerated.
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new HttpError(401, 'Invalid email or password');
  res.json({ token: signToken(user), profile: profileOf(user, user.provider) });
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ profile: profileOf(req.user, req.user.provider) });
});

module.exports = router;
