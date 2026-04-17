# Integrated Healthcare Portal (Prisma + Postgres + WebRTC Teleconsult)

This package contains a full-stack demo: frontend (React) + backend (Express + Prisma) + Postgres + Socket.IO signaling for Teleconsult.

Quick start (with Docker):
1. Copy `.env.example` in backend and adjust values if desired.
2. Run:
   docker-compose up --build
3. Backend: http://localhost:5000
   Frontend: http://localhost:3000 (may require build steps depending on frontend setup)

Notes:
- Frontend in this archive is minimal. For full dev experience run frontend with `npm install` and `npm start` inside /frontend.
- Prisma: after DB is up, run `npx prisma generate` and `npx prisma migrate deploy` in backend to ensure schema is applied.
- Teleconsult demo: open the Teleconsult page in two separate browser windows/tabs and click Start Teleconsult (both tabs) to perform signaling and establish peer connection.
