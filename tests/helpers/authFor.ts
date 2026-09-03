import jwt from 'jsonwebtoken';
import { config } from '../../src/config/env.js';

export function authHeaderFor(user: { id: string; role: 'USER' | 'ADMIN' }) {
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: '1h',
  });
  return { Authorization: `Bearer ${token}` };
}
