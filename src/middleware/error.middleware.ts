import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  errorCode?: string;

  constructor(
    message: string,
    statusCode: number,
    isOperational = true,
    errorCode?: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Custom error types
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, true, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string) {
    super(message, 401, true, 'AUTHENTICATION_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string) {
    super(message, 429, true, 'RATE_LIMIT_ERROR');
  }
}

// Error response formatter
const formatError = (error: AppError) => ({
  status: 'error',
  message: error.isOperational ? error.message : 'Internal server error',
  code: error.errorCode,
  statusCode: error.statusCode,
  ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
});

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const error =
    err instanceof AppError ? err : new AppError(err.message, 500, false);
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json(formatError(error));
};
