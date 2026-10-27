# Integrated Healthcare Portal

A telehealth web app where patients find verified doctors, book 30-minute slots and consult over **peer-to-peer WebRTC video**. Doctors manage their schedule and write consultation notes, and admins verify doctors before they're listed.

**Stack:** React (Vite) · Node.js / Express · PostgreSQL · Drizzle ORM · Socket.IO (WebRTC signaling) · JWT auth · Zod · Jest + Supertest · Docker · GitHub Actions · Render

## Features

| Patient | Doctor | Admin |
|---|---|---|
| Search by name, specialty, city | Register with practice details | Verify or revoke doctors |
| See live slot availability for 14 days | Set fee, bio, languages, daily slots | Dashboard of patients, doctors, bookings |
| Book, cancel, join video call | See upcoming consultations | |
| In-call chat, mute, camera toggle | Complete consultation with notes | |
| Rate the doctor after a completed visit | | |

## Architecture

```
 Browser (React SPA)                         Browser (React SPA)
   │  REST /api  +  Socket.IO (signaling)       │
   ▼                                            ▼
 ┌──────────────────────── Express server (one port) ────────────────────────┐
 │  helmet · CORS · rate limit · JSON                                        │
 │  /api/auth  /api/providers  /api/bookings  /api/reviews  /api/admin       │
 │  JWT middleware → role guard → zod validation → route handler → Drizzle   │
 │  Socket.IO: JWT handshake → join booking room → relay offer/answer/ICE    │
 │  Serves the built React app (client/dist) in production                   │
 └───────────────────────────────────┬───────────────────────────────────────┘
                                     ▼
                               PostgreSQL
 users ─1:1─ providers ─1:N─ bookings ─1:1─ reviews

 Video/audio flows directly browser ↔ browser (DTLS-SRTP encrypted).
 STUN discovers public addresses; an optional TURN server relays when needed.
```

### Design decisions worth knowing

- **No double-booking, even under concurrency.** A *partial unique index* on `(provider_id, date, time_slot) WHERE status <> 'CANCELLED'` makes the database reject a second active booking for the same slot (→ HTTP 409), and cancelled slots can be re-booked. A test fires two simultaneous requests and asserts exactly one wins.
- **Ratings can't drift.** Inserting a review and recomputing the doctor's denormalised `rating` / `reviews_count` happen in one transaction, with a `SELECT … FOR UPDATE` row lock.
- **Reviews are earned.** Only the patient of a *completed* consultation can review it, once (unique `booking_id`). A DB `CHECK` keeps ratings within 1–5.
- **Auth.** bcrypt password hashing, 8h JWTs, and the user is re-loaded on every request so role changes apply immediately. Users can't self-register as ADMIN. Login errors don't reveal whether an email exists. Auth routes are rate-limited.
- **Private by default.** Other people's bookings return 404 (not 403), so their existence isn't leaked. Public reviews show first names only.
- **Secure signaling.** Socket connections need a valid JWT. Only the booking's patient and doctor can join its room, with a maximum of two people.
- **Money as integers** (`fee_inr`), dates as `DATE` and all scheduling in IST.

## Run locally

**With Docker** (Postgres + app):

```bash
docker compose up --build
# open http://localhost:5000
```

**Without Docker** (Node 20+ and a local Postgres):

```bash
cp server/.env.example server/.env        # set DATABASE_URL
npm run install:all
npm run dev:server                        # migrates, seeds demo data, starts API + signaling on :5000
npm run dev:client                        # React on :5173, proxies /api and /socket.io
```

### Demo accounts (password `Demo@1234`)

| Role | Email |
|---|---|
| Patient | patient@demo.com |
| Doctor | doctor@demo.com |
| Admin | admin@demo.com |

To try a video call, sign in as the patient in one browser and as the doctor in another (or an incognito window). Book a slot with Dr. Ananya Rao, then click **Join video call** on both sides.

## Tests

```bash
npm test   # needs a Postgres database "healthcare_test" (see server/.env.test)
```

27 API and signaling tests cover auth, role guards, validation, double-booking races, cancellation, the review rules and socket authorisation. CI runs them on every push with a Postgres service container.

## Deploy (Render)

1. Push this repo to GitHub.
2. On [render.com](https://render.com): **New → Blueprint**, then pick the repo. `render.yaml` creates the web service and a Postgres database, and generates `JWT_SECRET`.
3. On first boot the app applies migrations and loads the demo data.

For calls on restrictive networks (some mobile carriers or offices), add a TURN server and set `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL`.

## Project structure

```
client/                 React app (Vite)
  src/pages/            Home, Doctor, Appointments, Consult (WebRTC), Admin, Profile, Login, Register
server/
  src/db/               Drizzle schema, migrations runner, seed
  src/routes/           auth, providers, bookings, reviews, admin
  src/middleware/       JWT auth + role guard, zod validation, error handler
  src/signaling.js      Socket.IO WebRTC signaling
  drizzle/              SQL migrations
  tests/                Jest + Supertest
Dockerfile · docker-compose.yml · render.yaml · .github/workflows/ci.yml
```

## Roadmap

Refresh tokens in httpOnly cookies · payment integration (Razorpay) · email/SMS reminders · e-prescriptions as PDF · ABDM/ABHA health-ID integration · Redis adapter to scale Socket.IO horizontally · AI symptom-to-specialty triage
