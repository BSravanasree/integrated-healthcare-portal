const path = require('path');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { db, pool } = require('./index');

async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
}

if (require.main === module) {
  runMigrations()
    .then(() => { console.log('Migrations applied'); return pool.end(); })
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { runMigrations };
