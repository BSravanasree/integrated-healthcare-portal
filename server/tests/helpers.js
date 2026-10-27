const request = require('supertest');
const { sql } = require('drizzle-orm');
const app = require('../src/app');
const { db, pool } = require('../src/db');
const { runMigrations } = require('../src/db/migrate');
const { nowParts, addDays } = require('../src/utils/time');

const api = () => request(app);

async function resetDb() {
  await runMigrations();
  await db.execute(sql`TRUNCATE reviews, bookings, providers, users RESTART IDENTITY CASCADE`);
}

let n = 0;
async function registerPatient(name = 'Test Patient') {
  n += 1;
  const res = await api().post('/api/auth/register')
    .send({ name, email: `patient${n}@test.com`, password: 'password123' });
  return { token: res.body.token, profile: res.body.profile };
}

async function registerDoctor({ verified = true } = {}) {
  n += 1;
  const res = await api().post('/api/auth/register').send({
    name: `Dr Test ${n}`, email: `doc${n}@test.com`, password: 'password123', role: 'PROVIDER',
    provider: { specialty: 'General Physician', city: 'Chennai', feeInr: 300 },
  });
  if (verified) await db.execute(sql`UPDATE providers SET verified = true WHERE id = ${res.body.profile.provider.id}`);
  return { token: res.body.token, profile: res.body.profile, providerId: res.body.profile.provider.id };
}

const tomorrow = () => addDays(nowParts().date, 1);
const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { api, resetDb, registerPatient, registerDoctor, tomorrow, auth, db, pool, sql };
