import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

interface AuthenticatedRequest extends Request {
  hmacSecret?: string;
}

const MAX_REQUEST_AGE = 5 * 60 * 1000; // 5 minutes in milliseconds
const MIN_REQUEST_AGE = -30 * 1000; // 30 seconds into the future (clock skew tolerance)

// In-memory nonce storage with timestamp
const nonceStore = new Map<string, number>();

// Cleanup old nonces every minute
setInterval(() => {
  const now = Date.now();
  for (const [nonce, timestamp] of nonceStore.entries()) {
    if (now - timestamp > MAX_REQUEST_AGE) {
      nonceStore.delete(nonce);
    }
  }
}, 60000);

export const validateHmac = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const timestamp = req.headers["x-timestamp"] as string;
  const signature = req.headers["x-signature"] as string;
  const nonce = req.headers["x-nonce"] as string;
  const apiKey = process.env.API_KEY;
  const secret = process.env.HMAC_SECRET_KEY;

  // Check if all required headers are present
  if (!timestamp || !signature || !nonce || !apiKey) {
    return res
      .status(401)
      .json({ error: "Missing required authentication headers" });
  }

  try {
    // Check if nonce was used
    if (nonceStore.has(nonce)) {
      return res.status(401).json({ error: "Nonce already used" });
    }

    // Store nonce with current timestamp
    nonceStore.set(nonce, Date.now());

    // Check timestamp freshness
    const requestTime = parseInt(timestamp);
    const currentTime = Date.now();
    const timeDiff = currentTime - requestTime;

    if (
      isNaN(requestTime) ||
      timeDiff > MAX_REQUEST_AGE ||
      timeDiff < MIN_REQUEST_AGE
    ) {
      return res
        .status(401)
        .json({ error: "Request expired or invalid timestamp" });
    }

    // In production, retrieve the HMAC secret for this user from your database
    // For now, we'll use the one attached by the auth middleware

    if (!secret) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    // Create the message to verify (timestamp + nonce + request body)
    const body = JSON.stringify(req.body);
    const message = `${timestamp}${nonce}${body}`;

    // Create expected signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest("hex");

    // Compare signatures using timing-safe comparison
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    ) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    next();
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Internal server error during validation" });
  }
};
