import { Request, Response, NextFunction } from 'express';
import { firebaseAuth } from '../config/firebase.config';
import { TokenCache } from '../types/express';

const tokenCache = new Map<string, TokenCache>();
const CACHE_DURATION = 45 * 60 * 1000; // 45 minutes

// Cache metrics
let cacheHits = 0;
let cacheMisses = 0;

// Atomic cleanup operation
const cleanupCache = () => {
  const now = Date.now();
  const expiredTokens = [];

  // First, collect all expired tokens
  for (const [token, cache] of tokenCache.entries()) {
    if (cache.expiryTime <= now) {
      expiredTokens.push(token);
    }
  }

  expiredTokens.forEach((token) => tokenCache.delete(token));
};

// Run cleanup at the same interval as cache duration
setInterval(cleanupCache, CACHE_DURATION);

export const firebaseAuthMiddleware = (required = true) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        if (required) {
          return res
            .status(401)
            .json({ error: 'No authorization token provided' });
        }
        return next();
      }

      if (!authHeader.startsWith('Bearer ')) {
        if (required) {
          return res.status(401).json({ error: 'Invalid token format' });
        }
        return next();
      }

      const idToken = authHeader.split('Bearer ')[1];

      // Check if token exists in cache
      const cachedToken = tokenCache.get(idToken);
      const now = Date.now();

      // Token exists in cache and is still valid
      if (cachedToken && cachedToken.expiryTime > now) {
        cacheHits++;
        req.user = cachedToken.decodedToken;
        return next();
      }

      cacheMisses++;

      try {
        const decodedToken = await firebaseAuth.verifyIdToken(idToken);
        tokenCache.set(idToken, {
          decodedToken,
          expiryTime: now + CACHE_DURATION,
        });
        req.user = decodedToken;
        next();
      } catch (error: any) {
        tokenCache.delete(idToken);
        if (required) {
          // Check if token is expired
          if (error.code === 'auth/id-token-expired') {
            return res.status(401).json({
              error: 'Token expired',
              code: 'TOKEN_EXPIRED',
            });
          }

          return res.status(401).json({
            error: 'Invalid token',
            code: 'INVALID_TOKEN',
          });
        }
        next();
      }
    } catch (error) {
      if (required) {
        return res
          .status(500)
          .json({ error: 'Internal server error during authentication' });
      }
      next();
    }
  };
};
