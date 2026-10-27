const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const config = require('../config');
const schema = require('./schema');

const pool = new Pool({
  connectionString: config.databaseUrl,
  // Managed Postgres (Render, Neon) requires TLS; local Docker doesn't.
  ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});

const db = drizzle(pool, { schema });

module.exports = { db, pool, schema };
