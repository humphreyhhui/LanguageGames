import rateLimit from 'express-rate-limit';

export const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many AI requests, please slow down' },
});
