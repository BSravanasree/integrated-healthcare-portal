const { api, resetDb, registerPatient, registerDoctor, tomorrow, auth, pool } = require('./helpers');

let patient; let patient2; let doctor; let unverified;

beforeAll(async () => {
  await resetDb();
  patient = await registerPatient('Asha');
  patient2 = await registerPatient('Bala');
  doctor = await registerDoctor();
  unverified = await registerDoctor({ verified: false });
});
afterAll(() => pool.end());

const book = (who, body) => api().post('/api/bookings').set(auth(who.token))
  .send({ providerId: doctor.providerId, date: tomorrow(), timeSlot: '10:00', ...body });

describe('doctor listing', () => {
  it('lists only verified doctors', async () => {
    const res = await api().get('/api/providers');
    const ids = res.body.items.map((p) => p.id);
    expect(ids).toContain(doctor.providerId);
    expect(ids).not.toContain(unverified.providerId);
  });
});

describe('bookings', () => {
  let bookingId;

  it('books a slot', async () => {
    const res = await book(patient, { reason: 'Fever for 3 days' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('BOOKED');
    bookingId = res.body.id;
  });

  it('prevents double-booking the same slot (409)', async () => {
    const res = await book(patient2);
    expect(res.status).toBe(409);
  });

  it('handles two simultaneous requests for one slot: exactly one wins', async () => {
    const results = await Promise.all([book(patient, { timeSlot: '11:00' }), book(patient2, { timeSlot: '11:00' })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('shows the slot as unavailable', async () => {
    const res = await api().get(`/api/providers/${doctor.providerId}/slots?date=${tomorrow()}`);
    expect(res.body.slots.find((s) => s.time === '10:00').available).toBe(false);
    expect(res.body.slots.find((s) => s.time === '14:00').available).toBe(true);
  });

  it('rejects slots the doctor does not offer and past dates', async () => {
    expect((await book(patient, { timeSlot: '03:00' })).status).toBe(400);
    expect((await book(patient, { date: '2020-01-01' })).status).toBe(400);
  });

  it('does not let doctors book appointments', async () => {
    expect((await book(doctor, { timeSlot: '15:00' })).status).toBe(403);
  });

  it('hides other patients\' bookings (404, not 403)', async () => {
    const res = await api().get(`/api/bookings/${bookingId}`).set(auth(patient2.token));
    expect(res.status).toBe(404);
  });

  it('shows the booking to both the patient and the doctor', async () => {
    const mine = await api().get('/api/bookings/mine').set(auth(patient.token));
    const docs = await api().get('/api/bookings/mine').set(auth(doctor.token));
    expect(mine.body.map((b) => b.id)).toContain(bookingId);
    expect(docs.body.map((b) => b.id)).toContain(bookingId);
  });

  it('frees the slot after cancellation so it can be re-booked', async () => {
    const cancel = await api().patch(`/api/bookings/${bookingId}/cancel`).set(auth(patient.token));
    expect(cancel.body.status).toBe('CANCELLED');
    expect((await book(patient2)).status).toBe(201);
  });
});

describe('reviews', () => {
  let bookingId;

  beforeAll(async () => {
    bookingId = (await book(patient, { timeSlot: '16:00' })).body.id;
  });

  const review = (who, body) => api().post('/api/reviews').set(auth(who.token)).send({ bookingId, rating: 5, ...body });

  it('cannot review before the consultation is completed', async () => {
    expect((await review(patient)).status).toBe(400);
  });

  it('only the doctor can complete a consultation', async () => {
    expect((await api().patch(`/api/bookings/${bookingId}/complete`).set(auth(patient.token))).status).toBe(403);
    const res = await api().patch(`/api/bookings/${bookingId}/complete`).set(auth(doctor.token))
      .send({ consultNotes: 'Paracetamol 500mg SOS. Review in 1 week.' });
    expect(res.body.status).toBe('COMPLETED');
  });

  it('rejects ratings outside 1-5', async () => {
    expect((await review(patient, { rating: 9 })).status).toBe(400);
  });

  it('another patient cannot review this booking', async () => {
    expect((await review(patient2)).status).toBe(404);
  });

  it('creates a review and updates the doctor rating', async () => {
    const res = await review(patient, { rating: 4, comment: 'Clear advice' });
    expect(res.status).toBe(201);
    const doc = await api().get(`/api/providers/${doctor.providerId}`);
    expect(doc.body.provider).toMatchObject({ rating: 4, reviewsCount: 1 });
  });

  it('allows only one review per consultation', async () => {
    expect((await review(patient)).status).toBe(409);
  });
});

describe('admin', () => {
  it('blocks non-admins', async () => {
    expect((await api().get('/api/admin/providers').set(auth(patient.token))).status).toBe(403);
  });
});
