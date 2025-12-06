import { Request, Response, NextFunction } from "express";
import { RateLimitError } from "./error.middleware";
import { validateEnv } from "../config/env.validator";

const env = validateEnv();

// Constants
const FIVE_MINUTES = 5 * 60 * 1000;

// Store for rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Utility to get real IP considering proxies
function getClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    // Get the first IP in case of multiple proxies
    return Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(",")[0].trim();
  }
  return req.ip || "unknown";
}

// Suspicious behavior detection
const suspiciousIPs = new Map<string, number>();
const SUSPICIOUS_THRESHOLD = 10;
const BLOCK_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function isSuspicious(ip: string): boolean {
  const count = suspiciousIPs.get(ip) || 0;
  return count >= SUSPICIOUS_THRESHOLD;
}

function markSuspicious(ip: string) {
  const count = (suspiciousIPs.get(ip) || 0) + 1;
  suspiciousIPs.set(ip, count);

  // Auto-cleanup after block duration
  setTimeout(() => {
    suspiciousIPs.delete(ip);
  }, BLOCK_DURATION);
}

// Base rate limiter
function createRateLimiter(
  windowMs: number,
  maxRequests: number,
  keyGenerator: (req: Request) => string,
  errorMessage: string
) {
  // Cleanup old entries every minute
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
      if (data.resetTime <= now) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000);

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);

    // Check for suspicious IP
    if (isSuspicious(ip)) {
      req.socket.destroy();
      return;
    }

    const key = keyGenerator(req);
    const now = Date.now();
    const rateLimit = rateLimitStore.get(key) || {
      count: 0,
      resetTime: now + windowMs,
    };

    // Reset if window has passed
    if (rateLimit.resetTime <= now) {
      rateLimit.count = 0;
      rateLimit.resetTime = now + windowMs;
    }

    rateLimit.count++;
    rateLimitStore.set(key, rateLimit);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader(
      "X-RateLimit-Remaining",
      Math.max(0, maxRequests - rateLimit.count)
    );
    res.setHeader("X-RateLimit-Reset", Math.ceil(rateLimit.resetTime / 1000));

    if (rateLimit.count > maxRequests) {
      markSuspicious(ip);
      next(new RateLimitError(errorMessage));
      return;
    }

    next();
  };
}

// Auth endpoint rate limiter
export const authRateLimiter = createRateLimiter(
  FIVE_MINUTES,
  env.AUTH_LIMIT,
  (req) => {
    const ip = getClientIp(req);
    const deviceId = req.headers["x-device-id"] || "unknown";
    return `auth:${ip}:${deviceId}`;
  },
  `Too many auth attempts. Please wait 5 minutes before trying again. (Limit: ${env.AUTH_LIMIT} requests per 5 minutes)`
);

// AI endpoints rate limiter
export const aiRateLimiter = createRateLimiter(
  FIVE_MINUTES,
  env.PROMPT_LIMIT,
  (req) => {
    const ip = getClientIp(req);
    const userId = req.headers["x-user-id"] || "unknown";
    const deviceId = req.headers["x-device-id"] || "unknown";
    return `ai:${ip}:${userId}:${deviceId}`;
  },
  `AI request limit reached. Please wait 5 minutes before trying again. (Limit: ${env.PROMPT_LIMIT} requests per 5 minutes)`
);
