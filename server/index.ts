import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './socket/handlers';
import { authRoutes } from './routes/auth';
import { gamesRoutes } from './routes/games';
import { pairsRoutes } from './routes/pairs';
import { statsRoutes } from './routes/stats';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/pairs', pairsRoutes);
app.use('/api/stats', statsRoutes);

// Socket.io
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Language Games server running on port ${PORT}`);
  console.log(`📡 Socket.io ready for connections`);
});

export { io };
