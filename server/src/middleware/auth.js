const jwt = require('jsonwebtoken');
const { eq } = require('drizzle-orm');
const config = require('../config');
const { db, schema } = require('../db');
const { HttpError, asyncHandler } = require('../utils/http');

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/**
 * Verifies the JWT, then loads the user from the DB so deleted users and
 * role changes take effect immediately (not only when the token expires).
 */
async function userFromToken(token) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, payload.sub),
    columns: { passwordHash: false },
    with: { provider: { columns: { id: true, verified: true } } },
  });
  return user || null;
}

const requireAuth = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Missing or malformed Authorization header');
  const user = await userFromToken(token);
  if (!user) throw new HttpError(401, 'Invalid or expired token');
  req.user = user;
  next();
});

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Unauthorized'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have access to this action'));
  next();
};

module.exports = { signToken, userFromToken, requireAuth, requireRole };
