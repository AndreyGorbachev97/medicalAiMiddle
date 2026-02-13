import { Request, Response, NextFunction } from 'express';
import { INTERNAL_API_SECRET } from '../config/env';

export const authenticateInternal = (req: Request, res: Response, next: NextFunction) => {
  const internalSecret = req.headers['x-internal-secret'] as string | undefined;

  if (!INTERNAL_API_SECRET || internalSecret !== INTERNAL_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = req.headers['x-user-id'] as string | undefined;
  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  (req as any).user = { id: userId };
  return next();
};
