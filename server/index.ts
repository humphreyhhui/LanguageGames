import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import { setupSocketHandlers } from './socket/handlers';
import { authRoutes } from './routes/auth';
import { gamesRoutes } from './routes/games';
import { pairsRoutes } from './routes/pairs';
import { statsRoutes } from './routes/stats';

const app = express();
const server = http.createServer(app);

// ── Security Middleware ───────────────────────────────────────

// Helmet sets various HTTP headers for security
app.use(helmet());

// CORS: allow localhost and any exp:// (Expo) — works across WiFi changes
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.startsWith('exp://') || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Body size limit: 10KB max (prevents memory DoS)
app.use(express.json({ limit: '10kb' }));

// Global rate limit: 100 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(globalLimiter);

// Stricter rate limit for LLM-heavy endpoints
export const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // 10 LLM calls per minute per IP
  message: { error: 'Too many AI requests, please slow down' },
});

// ── Socket.io ─────────────────────────────────────────────────

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin.startsWith('exp://') || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Limit payload size for socket messages
  maxHttpBufferSize: 1e5, // 100KB
});

// ── Health Check ──────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/pairs', pairsRoutes);
app.use('/api/stats', statsRoutes);

// ── Socket Handlers ───────────────────────────────────────────

setupSocketHandlers(io);

// ── Start ─────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Language Games server running on port ${PORT}`);
  console.log(`📡 Socket.io ready for connections`);
  console.log(`🔒 Security: Helmet, CORS, rate limiting, body limits enabled`);
});

export { io };
