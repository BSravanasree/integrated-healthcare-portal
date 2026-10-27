const http = require('http');
const { io: Client } = require('socket.io-client');
const app = require('../src/app');
const { initSignaling } = require('../src/signaling');
const { resetDb, registerPatient, registerDoctor, tomorrow, auth, api, pool } = require('./helpers');

let server; let url; let patient; let doctor; let stranger; let bookingId;
const sockets = [];

const connect = (token) => new Promise((resolve, reject) => {
  const s = Client(url, { auth: { token }, transports: ['websocket'], forceNew: true });
  sockets.push(s);
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const join = (s) => new Promise((resolve) => s.emit('join-room', { bookingId }, resolve));

beforeAll(async () => {
  await resetDb();
  patient = await registerPatient();
  stranger = await registerPatient();
  doctor = await registerDoctor();
  bookingId = (await api().post('/api/bookings').set(auth(patient.token))
    .send({ providerId: doctor.providerId, date: tomorrow(), timeSlot: '09:30' })).body.id;
  server = http.createServer(app);
  initSignaling(server);
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  await new Promise((r) => server.close(r));
  await pool.end();
});

describe('signaling', () => {
  it('rejects sockets without a valid token', async () => {
    await expect(connect('bad-token')).rejects.toThrow('unauthorized');
  });

  it('keeps strangers out of a consultation room', async () => {
    const s = await connect(stranger.token);
    expect((await join(s)).error).toMatch(/not part/);
  });

  it('lets patient and doctor join and relays signals between them', async () => {
    const p = await connect(patient.token);
    expect(await join(p)).toEqual({ ok: true, peerPresent: false, peerName: null });

    const d = await connect(doctor.token);
    const peerJoined = new Promise((r) => p.once('peer-joined', r));
    expect(await join(d)).toMatchObject({ ok: true, peerPresent: true });
    await peerJoined;

    const got = new Promise((r) => d.once('signal', r));
    p.emit('signal', { type: 'offer', sdp: 'fake-sdp' });
    expect(await got).toEqual({ type: 'offer', sdp: 'fake-sdp' });
  });
});
