/* Idempotent demo data: safe to run on every start. Skips if the admin already exists. */
const bcrypt = require('bcryptjs');
const { eq, avg, count } = require('drizzle-orm');
const { db, pool, schema } = require('./index');
const { nowParts, addDays } = require('../utils/time');

const PASSWORD = 'Demo@1234';

const doctors = [
  { name: 'Dr. Ananya Rao', email: 'doctor@demo.com', specialty: 'General Physician', city: 'Chennai', feeInr: 400, experienceYears: 9, languages: ['English', 'Tamil', 'Telugu'], bio: 'MBBS, MD (Internal Medicine). Fevers, infections, diabetes and blood-pressure follow-ups.' },
  { name: 'Dr. Karthik Subramanian', email: 'karthik@demo.com', specialty: 'Cardiologist', city: 'Chennai', feeInr: 900, experienceYears: 15, languages: ['English', 'Tamil'], bio: 'DM Cardiology. Chest pain evaluation, hypertension and post-angioplasty care.' },
  { name: 'Dr. Priya Reddy', email: 'priya@demo.com', specialty: 'Dermatologist', city: 'Hyderabad', feeInr: 600, experienceYears: 7, languages: ['English', 'Telugu', 'Hindi'], bio: 'MD Dermatology. Acne, eczema, hair fall and skin allergies.' },
  { name: 'Dr. Arjun Mehta', email: 'arjun@demo.com', specialty: 'Pediatrician', city: 'Bengaluru', feeInr: 500, experienceYears: 11, languages: ['English', 'Hindi', 'Kannada'], bio: 'MD Pediatrics. Child growth, vaccinations and common childhood illnesses.' },
  { name: 'Dr. Lakshmi Narayanan', email: 'lakshmi@demo.com', specialty: 'Gynecologist', city: 'Chennai', feeInr: 700, experienceYears: 13, languages: ['English', 'Tamil'], bio: 'MS OBG. Pregnancy care, PCOS and menstrual health.' },
  { name: 'Dr. Rahul Verma', email: 'rahul@demo.com', specialty: 'Psychiatrist', city: 'Bengaluru', feeInr: 800, experienceYears: 10, languages: ['English', 'Hindi'], bio: 'MD Psychiatry. Anxiety, sleep problems, stress and depression.' },
  { name: 'Dr. Sneha Kulkarni', email: 'sneha@demo.com', specialty: 'Orthopedic', city: 'Hyderabad', feeInr: 650, experienceYears: 8, languages: ['English', 'Hindi', 'Marathi'], bio: 'MS Ortho. Back and joint pain, sports injuries and fracture follow-up.' },
  { name: 'Dr. Vikram Iyer', email: 'vikram@demo.com', specialty: 'ENT Specialist', city: 'Chennai', feeInr: 550, experienceYears: 12, languages: ['English', 'Tamil', 'Malayalam'], bio: 'MS ENT. Sinusitis, ear infections, tonsillitis and hearing issues.' },
];

const pendingDoctor = { name: 'Dr. Farhan Ali', email: 'pending@demo.com', specialty: 'Neurologist', city: 'Hyderabad', feeInr: 1000, experienceYears: 6, languages: ['English', 'Hindi', 'Urdu'], bio: 'DM Neurology. Migraine, seizures and nerve pain. (Awaiting admin verification.)' };

const patients = [
  { name: 'Ravi Kumar', email: 'patient@demo.com' },
  { name: 'Meena Sundaram', email: 'meena@demo.com' },
  { name: 'Sai Teja', email: 'sai@demo.com' },
];

const sampleReviews = [
  [5, 'Very patient and explained everything clearly.'],
  [4, 'Good consultation, video quality was smooth.'],
  [5, 'Saved me a 3-hour trip to the city. Highly recommend.'],
  [4, 'Helpful advice and quick prescription.'],
  [3, 'Consultation was fine but started a few minutes late.'],
];

async function seed() {
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, 'admin@demo.com') });
  if (existing) {
    console.log('Seed: demo data already present, skipping');
    return;
  }
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values({ name: 'Portal Admin', email: 'admin@demo.com', passwordHash, role: 'ADMIN' });
    const patientRows = await tx.insert(schema.users)
      .values(patients.map((p) => ({ ...p, passwordHash, role: 'PATIENT' }))).returning();

    const providerRows = [];
    for (const d of [...doctors, pendingDoctor]) {
      const { name, email, ...profile } = d;
      const [u] = await tx.insert(schema.users).values({ name, email, passwordHash, role: 'PROVIDER' }).returning();
      const [p] = await tx.insert(schema.providers)
        .values({ ...profile, userId: u.id, verified: d !== pendingDoctor }).returning();
      providerRows.push(p);
    }

    // Past completed consultations with reviews so ratings look realistic.
    const today = nowParts().date;
    let k = 0;
    for (const [i, provider] of providerRows.slice(0, doctors.length).entries()) {
      const n = 2 + (i % 3);
      for (let j = 0; j < n; j += 1) {
        const patient = patientRows[(i + j) % patientRows.length];
        const [rating, comment] = sampleReviews[(k += 1) % sampleReviews.length];
        const [b] = await tx.insert(schema.bookings).values({
          providerId: provider.id, patientId: patient.id, date: addDays(today, -(j * 7 + i + 2)),
          timeSlot: provider.slotTimes[j % provider.slotTimes.length], status: 'COMPLETED',
          reason: 'Follow-up consultation', consultNotes: 'Advised rest, hydration and review in 2 weeks.',
        }).returning();
        await tx.insert(schema.reviews).values({ bookingId: b.id, providerId: provider.id, patientId: patient.id, rating, comment });
      }
      const [stats] = await tx.select({ avg: avg(schema.reviews.rating), n: count() })
        .from(schema.reviews).where(eq(schema.reviews.providerId, provider.id));
      await tx.update(schema.providers)
        .set({ rating: Math.round(Number(stats.avg) * 10) / 10, reviewsCount: Number(stats.n) })
        .where(eq(schema.providers.id, provider.id));
    }
  });
  console.log(`Seed: demo data created (password for all demo accounts: ${PASSWORD})`);
}

if (require.main === module) {
  seed().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { seed, PASSWORD };
