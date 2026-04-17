require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSignaling } = require('./signaling');
const { prisma } = require('./utils/prisma');

const port = process.env.PORT || 5000;
const server = http.createServer(app);

initSignaling(server);

async function start() {
  try {
    // test prisma connection
    await prisma.$connect();
    console.log('Prisma connected');
    // run pending migrations in prod via prisma migrate; for dev, ensure schema is applied via migrate
    server.listen(port, () => console.log(`Server running on http://localhost:${port}`));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
