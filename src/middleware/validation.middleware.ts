import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { ValidateRequestOptions } from '../types/express';

// Common headers for all requests
const commonHeaderSchema = z.object({
  'content-type': z.literal('application/json'),
  'x-signature': z.string().min(32),
  'x-timestamp': z.string().regex(/^\d+$/),
  'x-nonce': z.string().min(8),
  'x-app-identifier': z.string().min(1),
  'x-device-id': z.string().min(1),
  'x-platform': z.enum(['ios', 'android']),
});

// Additional headers required for AI endpoints
const aiHeaderSchema = commonHeaderSchema.extend({
  authorization: z.string().regex(/^Bearer .+$/),
  'x-app-version': z.string().min(1),
  'x-user-id': z.string().min(1),
});

// Request validation middleware
export const validateRequest = (options: ValidateRequestOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Select header schema based on whether auth is required
      const headerSchema = options.requireAuth
        ? aiHeaderSchema
        : commonHeaderSchema;

      // Convert headers to lowercase for consistent validation
      const normalizedHeaders = Object.entries(req.headers).reduce(
        (acc, [key, value]) => ({
          ...acc,
          [key.toLowerCase()]: value,
        }),
        {}
      );

      // Validate headers
      await headerSchema.parseAsync(normalizedHeaders);

      // Validate timestamp (within 5 minutes)
      const timestamp = parseInt(req.headers['x-timestamp'] as string, 10);
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (Math.abs(now - timestamp) > fiveMinutes) {
        return res.status(401).json({ error: 'Timestamp expired' });
      }

      // Sanitize and validate body if schema provided
      if (options.bodySchema && Object.keys(req.body).length > 0) {
        const sanitizedBody = sanitizeInput(req.body);
        await options.bodySchema.parseAsync(sanitizedBody);
        req.body = sanitizedBody;
      }

      // Add validated user ID to request if present
      if (req.headers['x-user-id']) {
        req.userId = req.headers['x-user-id'] as string;
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
      } else {
        res.status(400).json({
          error: 'Invalid request',
        });
      }
    }
  };
};

// Sanitize and validate request body
function sanitizeInput(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeHtml(obj, {
      allowedTags: [], // No HTML tags allowed
      allowedAttributes: {}, // No attributes allowed
    });
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeInput);
  }
  if (typeof obj === 'object' && obj !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return obj;
}
