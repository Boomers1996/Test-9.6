const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static files (Vite dev serves from root; in prod, serve dist)
const staticDir = path.join(__dirname, 'dist');
app.use(express.json());
app.use(express.static(staticDir));

// Simple health
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// REST endpoint to trigger an emotion or action
app.post('/api/animate', (req, res) => {
  const { type, name, value, duration } = req.body || {};
  io.emit('animate', { type, name, value, duration });
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  socket.on('animate', (payload) => {
    socket.broadcast.emit('animate', payload);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

