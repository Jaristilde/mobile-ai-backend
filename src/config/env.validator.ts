import { z } from 'zod';

const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  // Application
  APP_IDENTIFIER: z.string().min(1, 'App identifier is required').trim(),
  // Rate Limits
  AUTH_LIMIT: z.coerce
    .number()
    .min(1)
    .max(10)
    .default(process.env.NODE_ENV === 'production' ? 1 : 10)
    .describe('Number of auth requests allowed per user per 5 minutes'),
  PROMPT_LIMIT: z.coerce.number().min(1).max(100).default(20),
  // Node Version
  NODE_VERSION: z
    .string()
    .regex(/^\d+\.x$/, 'Invalid Node version format')
    .default('20.x')
    .optional(),

  // Security
  API_KEY: z.string().min(1, 'API key is required').trim(),
  HMAC_SECRET_KEY: z
    .string()
    .min(32, 'HMAC secret key must be at least 32 characters')
    .trim(),

  // CORS
  ALLOWED_ORIGINS: z
    .string()
    .transform((val) => val.split(',').map((origin) => origin.trim()))
    .default('http://localhost:3000'),

  // AI Provider Keys
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  FAL_API_KEY: z.string().optional(),
  REPLICATE_API_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates environment variables against the defined schema
 * @throws {Error} If environment validation fails
 */
export function validateEnv(): EnvConfig {
  try {
    const env = envSchema.parse(process.env);

    // Ensure ALLOWED_ORIGINS is always an array
    if (
      !Array.isArray(env.ALLOWED_ORIGINS) ||
      env.ALLOWED_ORIGINS.length === 0
    ) {
      env.ALLOWED_ORIGINS = ['http://localhost:3000'];
    }

    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach((err) => {
        console.error(`  → ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error(
        '❌ Unexpected error during environment validation:',
        error
      );
    }
    process.exit(1); // Exit process on validation failure
  }
}

export const config = validateEnv();
