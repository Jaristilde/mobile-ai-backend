import { Router } from 'express';
import { authService } from '../services/auth.service';
import crypto from 'crypto';

const router = Router();

// Store used nonces with their timestamps (in-memory for now)
const usedNonces = new Map<string, number>();

// Clean up old nonces every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [nonce, timestamp] of usedNonces.entries()) {
    if (timestamp < fiveMinutesAgo) {
      usedNonces.delete(nonce);
    }
  }
}, 5 * 60 * 1000);

router.post('/', (req, res) => {
  try {
    const apiKey = process.env.API_KEY;
    const appIdentifier = process.env.APP_IDENTIFIER;
    const signature = req.headers['x-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;
    const nonce = req.headers['x-nonce'] as string;

    // Validate required headers
    if (!signature || !timestamp || !nonce) {
      return res.status(401).json({
        error: 'Missing required headers (signature, timestamp, nonce)',
      });
    }

    if (!apiKey || !appIdentifier) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Validate timestamp (within 5 minutes)
    const timestampNum = parseInt(timestamp, 10);
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (isNaN(timestampNum) || Math.abs(now - timestampNum) > fiveMinutes) {
      return res.status(401).json({ error: 'Invalid or expired timestamp' });
    }

    // Check if nonce was used
    if (usedNonces.has(nonce)) {
      return res.status(401).json({ error: 'Nonce already used' });
    }

    // Store nonce with current timestamp
    usedNonces.set(nonce, now);

    // Generate expected signature with timestamp and nonce
    const expectedSignature = crypto
      .createHmac('sha256', apiKey)
      .update(`${appIdentifier}${timestamp}${nonce}`)
      .digest('hex');

    // Compare signatures using timing-safe comparison
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    ) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const encryptedSecret = authService.getEncryptedHmacSecret();
    res.json({
      encryptedSecret,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate signature' });
  }
});

export const authRoutes = router;
