import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { getUserByEmail, getUserById } from '../data/store.js';
import { JWT_SECRET } from '../config/security.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAdmin } from '../middleware/require-admin.middleware.js';
import { verifyPassword } from '../services/password.js';

const router = Router();
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de inicio de sesión. Intenta más tarde.' },
});

const buildToken = (user) => jwt.sign(
  {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  },
  JWT_SECRET,
  { expiresIn: '7d' },
);

router.post('/login', loginRateLimit, asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = getUserByEmail(email.trim().toLowerCase());

  if (
    password.length > 128 ||
    !user ||
    user.role !== 'ADMIN' ||
    !(await verifyPassword(password, user.password))
  ) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = buildToken(user);

  return res.status(200).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}));

router.get('/me', authenticateToken, requireAdmin, (req, res) => {
  const user = getUserById(req.user.id);
  return user
    ? res.status(200).json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      })
    : res.status(404).json({ message: 'Owner not found' });
});

export default router;
