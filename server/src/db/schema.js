const {
  pgTable, pgEnum, uuid, text, integer, boolean, real, date, timestamp,
  index, uniqueIndex, check,
} = require('drizzle-orm/pg-core');
const { sql, relations } = require('drizzle-orm');

const DEFAULT_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

const roleEnum = pgEnum('role', ['PATIENT', 'PROVIDER', 'ADMIN']);
const bookingStatusEnum = pgEnum('booking_status', ['BOOKED', 'CANCELLED', 'COMPLETED']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
    .$onUpdate(() => new Date()),
};

const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('PATIENT'),
  ...timestamps,
});

const providers = pgTable('providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  specialty: text('specialty').notNull(),
  bio: text('bio'),
  city: text('city'),
  languages: text('languages').array().notNull().default(sql`'{}'::text[]`),
  experienceYears: integer('experience_years').notNull().default(0),
  // Whole rupees: integers avoid floating-point money errors.
  feeInr: integer('fee_inr').notNull().default(0),
  slotTimes: text('slot_times').array().notNull()
    .default(sql.raw(`'{${DEFAULT_SLOTS.join(',')}}'::text[]`)),
  verified: boolean('verified').notNull().default(false),
  // Denormalised for fast listing; recomputed in a transaction on every review.
  rating: real('rating').notNull().default(0),
  reviewsCount: integer('reviews_count').notNull().default(0),
  ...timestamps,
}, (t) => [
  index('providers_specialty_idx').on(t.specialty),
  index('providers_city_idx').on(t.city),
]);

const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id').notNull().references(() => providers.id),
  patientId: uuid('patient_id').notNull().references(() => users.id),
  date: date('date', { mode: 'string' }).notNull(),
  timeSlot: text('time_slot').notNull(),
  status: bookingStatusEnum('status').notNull().default('BOOKED'),
  reason: text('reason'),
  consultNotes: text('consult_notes'),
  ...timestamps,
}, (t) => [
  // Partial unique index: no double-booking, but a cancelled slot can be re-booked.
  uniqueIndex('bookings_active_slot_key')
    .on(t.providerId, t.date, t.timeSlot)
    .where(sql`${t.status} <> 'CANCELLED'`),
  index('bookings_patient_idx').on(t.patientId),
  index('bookings_provider_date_idx').on(t.providerId, t.date),
]);

const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').notNull().unique().references(() => bookings.id),
  providerId: uuid('provider_id').notNull().references(() => providers.id),
  patientId: uuid('patient_id').notNull().references(() => users.id),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('reviews_provider_idx').on(t.providerId),
  check('reviews_rating_range', sql`${t.rating} BETWEEN 1 AND 5`),
]);

const usersRelations = relations(users, ({ one, many }) => ({
  provider: one(providers, { fields: [users.id], references: [providers.userId] }),
  bookings: many(bookings),
  reviews: many(reviews),
}));
const providersRelations = relations(providers, ({ one, many }) => ({
  user: one(users, { fields: [providers.userId], references: [users.id] }),
  bookings: many(bookings),
  reviews: many(reviews),
}));
const bookingsRelations = relations(bookings, ({ one }) => ({
  provider: one(providers, { fields: [bookings.providerId], references: [providers.id] }),
  patient: one(users, { fields: [bookings.patientId], references: [users.id] }),
  review: one(reviews, { fields: [bookings.id], references: [reviews.bookingId] }),
}));
const reviewsRelations = relations(reviews, ({ one }) => ({
  booking: one(bookings, { fields: [reviews.bookingId], references: [bookings.id] }),
  provider: one(providers, { fields: [reviews.providerId], references: [providers.id] }),
  patient: one(users, { fields: [reviews.patientId], references: [users.id] }),
}));

module.exports = {
  DEFAULT_SLOTS, roleEnum, bookingStatusEnum, users, providers, bookings, reviews,
  usersRelations, providersRelations, bookingsRelations, reviewsRelations,
};
