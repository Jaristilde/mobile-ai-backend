import cors from 'cors';
import { Express } from 'express';

export const configureCorsMiddleware = (app: Express) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [];

  app.use(
    cors({
      origin: (origin, callback) => {
        // origin undefined ise localhost/postman gibi araçlardan gelen istek
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('CORS policy violation'));
        }
      },
      methods: ['POST'], // Sadece POST isteklerine izin ver
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-signature',
        'x-nonce',
        'x-timestamp',
        'x-app-version',
        'x-device-id',
        'x-platform',
        'x-app-identifier',
      ],
      credentials: true,
      maxAge: 600, // CORS önbellek süresi: 10 dakika
    })
  );
};
