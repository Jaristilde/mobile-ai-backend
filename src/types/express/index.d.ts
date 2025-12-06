import { DecodedIdToken } from 'firebase-admin/auth';
import { z } from 'zod';
import { ParsedQs } from 'qs';

/**
 * Global type declarations for Express.js
 * Extends the default Express types with custom properties
 */
declare global {
  namespace Express {
    interface Request {
      /**
       * Authentication related properties
       */
      user?: DecodedIdToken;
      userId?: string;

      /**
       * Application metadata
       */
      appId?: string; // Changed from app_id to follow camelCase convention
      deviceId?: string;

      /**
       * Device information
       */
      platform?: PlatformType;
      appVersion?: string;
    }
  }
}

/**
 * Supported platform types
 */
export type PlatformType = 'ios' | 'android' | 'web';

/**
 * Validation related types
 */
export interface ValidateRequestOptions {
  requireAuth?: boolean;
  bodySchema?: z.ZodSchema;
}

/**
 * Cache related types
 */
export interface CacheOptions {
  ttl?: number;
  skipCache?: boolean;
}

export interface CacheEntry {
  value: string;
  expiresAt: number;
}

/**
 * Audit log types
 */
export interface AuditLog {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  query: ParsedQs;
  headers: Record<string, string | string[] | undefined>;
  body?: string | Record<string, unknown>;
  ip: string | undefined;
  userAgent: string;
  duration: number;
  statusCode: number;
  error?: {
    message: string;
    name: string;
  };
}

/**
 * Fal AI types
 */
export interface FalResponse {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type: string;
  }>;
  timings: { inference: number };
  seed: number;
  has_nsfw_concepts: boolean[];
  prompt: string;
}

export type FalInput = {
  prompt: string;
  num_inference_steps?: number;
  guidance_scale?: number;
  negative_prompt?: string;
  image_url?: string;
  scale?: number;
};

export interface TokenCache {
  decodedToken: DecodedIdToken;
  expiryTime: number;
}

declare module 'crypto-js';
// This export is needed to make this a module
export {};
