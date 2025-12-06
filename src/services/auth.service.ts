import { AES } from 'crypto-js';
import { config } from '../config/env.validator';

class AuthService {
  private readonly encryptionKey: string;

  constructor() {
    // API anahtarını encryption key olarak kullanıyoruz
    this.encryptionKey = config.API_KEY;
  }

  public getEncryptedHmacSecret(): string {
    try {
      // HMAC secret'ı şifrele
      const encrypted = AES.encrypt(
        config.HMAC_SECRET_KEY,
        this.encryptionKey
      ).toString();
      return encrypted;
    } catch (error) {
      throw new Error('Failed to encrypt HMAC secret');
    }
  }

  public validateApiKey(apiKey: string): boolean {
    return apiKey === config.API_KEY;
  }
}

export const authService = new AuthService();
