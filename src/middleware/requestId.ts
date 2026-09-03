import { randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      validatedQuery?: unknown;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  req.id = randomBytes(4).toString('hex');
  res.setHeader('x-request-id', req.id);
  next();
}
