const { Server } = require('socket.io');

function initSignaling(httpServer) {
  const io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    console.log('Socket connected', socket.id);

    socket.on('join-room', ({ roomId }) => {
      socket.join(roomId);
      socket.to(roomId).emit('peer-joined', { socketId: socket.id });
    });

    socket.on('signal', ({ roomId, data }) => {
      socket.to(roomId).emit('signal', { from: socket.id, data });
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected', socket.id);
    });
  });

  console.log('Signaling initialized');
  return io;
}

module.exports = { initSignaling };
