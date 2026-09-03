import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AuthError, ForbiddenError } from '../domain/errors.js';

export interface AuthContext {
  userId: string;
  role: 'USER' | 'ADMIN';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new AuthError('Missing bearer token'));
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
    req.auth = {
      userId: String(payload.sub),
      role: payload.role === 'ADMIN' ? 'ADMIN' : 'USER',
    };
    next();
  } catch {
    next(new AuthError('Invalid or expired token'));
  }
}

export function requireRole(role: 'ADMIN') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.auth?.role !== role) return next(new ForbiddenError('Insufficient role'));
    next();
  };
}
