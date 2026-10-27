const http = require('http');
const config = require('./config');
const app = require('./app');
const { pool } = require('./db');
const { initSignaling } = require('./signaling');

// REST API and WebSocket signaling share one HTTP server and port.
const server = http.createServer(app);
initSignaling(server);

async function start() {
  await pool.query('select 1'); // fail fast if the database is unreachable
  server.listen(config.port, () => console.log(`Server listening on port ${config.port}`));
}

function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
