const config = require('../config');

function notFound(req, res) {
  res.status(404).json({ message: 'Not Found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Postgres unique_violation: e.g. two patients racing for the same slot.
  const pgCode = err.code || err.cause?.code;
  if (pgCode === '23505') {
    return res.status(409).json({ message: 'That record already exists (the slot may have just been taken).' });
  }
  if (pgCode === '22P02') {
    return res.status(400).json({ message: 'Invalid identifier' });
  }
  const status = err.status || 500;
  if (status >= 500 && !config.isTest) console.error(err);
  res.status(status).json({
    message: status >= 500 ? 'Internal server error' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}

module.exports = { notFound, errorHandler };
