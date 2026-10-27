const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { pool } = require('./db');
const { requireAuth } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
app.set('trust proxy', 1); // behind Render's load balancer: real client IP for rate limiting

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      mediaSrc: ["'self'", 'blob:'],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));
if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '100kb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  skip: () => config.isTest,
  message: { message: 'Too many attempts, please try again in a few minutes' },
});

const api = express.Router();
api.get('/health', async (req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true, db: 'up' });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  }
});
api.use('/auth', authLimiter, require('./routes/auth'));
api.use('/providers', require('./routes/providers'));
api.use('/bookings', require('./routes/bookings').router);
api.use('/reviews', require('./routes/reviews'));
api.use('/admin', require('./routes/admin'));

// ICE servers for WebRTC: public STUN always, plus TURN when configured
// (TURN relays media when strict NAT/firewalls block a direct peer connection).
api.get('/config/ice', requireAuth, (req, res) => {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (config.turn.url) {
    iceServers.push({ urls: config.turn.url.split(','), username: config.turn.username, credential: config.turn.credential });
  }
  res.json({ iceServers });
});
api.use(notFound);
app.use('/api', api);

// In production the Express server also serves the built React app (one deployable unit).
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1h', index: false }));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
