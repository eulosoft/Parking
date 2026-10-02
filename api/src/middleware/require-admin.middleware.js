import { getUserById } from '../data/store.js';

export function requireAdmin(req, res, next) {
  const user = getUserById(req.user?.id);
  if (!user || user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Administrator access required.' });
  }

  req.user = {
    ...req.user,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  return next();
}
