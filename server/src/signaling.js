const { Server } = require('socket.io');
const config = require('./config');
const { db, schema } = require('./db');
const { eq } = require('drizzle-orm');
const { userFromToken } = require('./middleware/auth');

/**
 * WebRTC signaling over Socket.IO.
 * The server never touches audio/video; it only relays SDP offers/answers and
 * ICE candidates between the two participants of a booking. Media flows
 * peer-to-peer (encrypted with DTLS-SRTP).
 */
function initSignaling(httpServer) {
  const io = new Server(httpServer, {
    cors: config.corsOrigin ? { origin: config.corsOrigin } : undefined,
  });

  // Authenticate the socket handshake with the same JWT the REST API uses.
  io.use(async (socket, next) => {
    try {
      const user = await userFromToken(socket.handshake.auth?.token);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;

    socket.on('join-room', async ({ bookingId } = {}, ack = () => {}) => {
      try {
        if (!/^[0-9a-f-]{36}$/i.test(String(bookingId))) return ack({ error: 'Invalid consultation link' });
        const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, String(bookingId)) });
        const isPatient = booking && booking.patientId === user.id;
        const isDoctor = booking && user.provider && booking.providerId === user.provider.id;
        // Only the patient and doctor of an active booking may join its room.
        if (!isPatient && !isDoctor) return ack({ error: 'You are not part of this consultation' });
        if (booking.status !== 'BOOKED') return ack({ error: `This consultation is ${booking.status.toLowerCase()}` });

        const room = `booking:${booking.id}`;
        const peers = await io.in(room).fetchSockets();
        if (peers.some((s) => s.data.user.id === user.id)) {
          return ack({ error: 'You are already in this call in another tab' });
        }
        if (peers.length >= 2) return ack({ error: 'Room is full' });

        socket.join(room);
        socket.data.room = room;
        // The peer that was already waiting becomes the "caller" and sends the offer.
        socket.to(room).emit('peer-joined', { name: user.name, role: user.role });
        ack({ ok: true, peerPresent: peers.length === 1, peerName: peers[0]?.data.user.name || null });
      } catch (err) {
        console.error(err);
        ack({ error: 'Could not join the room' });
      }
    });

    // Relay offer / answer / ICE candidates to the other participant only.
    socket.on('signal', (data) => {
      if (socket.data.room) socket.to(socket.data.room).emit('signal', data);
    });

    socket.on('chat', (text) => {
      if (!socket.data.room || typeof text !== 'string' || !text.trim()) return;
      io.to(socket.data.room).emit('chat', { from: user.name, fromId: user.id, text: text.slice(0, 1000), at: Date.now() });
    });

    const leave = () => {
      if (socket.data.room) {
        socket.to(socket.data.room).emit('peer-left');
        socket.leave(socket.data.room);
        socket.data.room = null;
      }
    };
    socket.on('leave-room', leave);
    socket.on('disconnect', leave);
  });

  return io;
}

module.exports = { initSignaling };
