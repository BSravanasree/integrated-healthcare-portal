const { api, resetDb, pool, auth } = require('./helpers');

beforeAll(resetDb);
afterAll(() => pool.end());

describe('auth', () => {
  it('registers a patient and returns a token', async () => {
    const res = await api().post('/api/auth/register')
      .send({ name: 'Ravi', email: 'Ravi@Example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.profile).toMatchObject({ email: 'ravi@example.com', role: 'PATIENT' });
    expect(res.body.profile.passwordHash).toBeUndefined();
  });

  it('refuses to let anyone self-register as ADMIN', async () => {
    const res = await api().post('/api/auth/register')
      .send({ name: 'Mallory', email: 'm@example.com', password: 'password123', role: 'ADMIN' });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate emails with 409', async () => {
    const res = await api().post('/api/auth/register')
      .send({ name: 'Ravi 2', email: 'ravi@example.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('validates input', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'X', email: 'bad', password: '1' });
    expect(res.status).toBe(400);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('gives the same error for unknown email and wrong password', async () => {
    const a = await api().post('/api/auth/login').send({ email: 'ravi@example.com', password: 'wrong-pass' });
    const b = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong-pass' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('logs in and fetches /me', async () => {
    const login = await api().post('/api/auth/login').send({ email: 'ravi@example.com', password: 'password123' });
    expect(login.status).toBe(200);
    const me = await api().get('/api/auth/me').set(auth(login.body.token));
    expect(me.status).toBe(200);
    expect(me.body.profile.name).toBe('Ravi');
  });

  it('rejects requests with a bad token', async () => {
    const res = await api().get('/api/auth/me').set(auth('not-a-jwt'));
    expect(res.status).toBe(401);
  });
});
