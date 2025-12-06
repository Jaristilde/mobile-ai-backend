import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const parsedConfig = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // Fix private key format
    if (parsedConfig.private_key) {
      parsedConfig.private_key = parsedConfig.private_key.replace(/\\n/g, '\n');
    }

    serviceAccount = parsedConfig;
  } else {
    // For local development
    serviceAccount = require('../../firebase-service-account.json');
  }
} catch (error) {
  console.error('Error parsing FIREBASE_SERVICE_ACCOUNT:', error);
  // Fallback to local file if JSON parsing fails
  serviceAccount = require('../../firebase-service-account.json');
}

// Firebase Admin SDK Initialization
const firebaseApp = initializeApp({
  credential: cert(serviceAccount),
});

// Initialize Auth
const firebaseAuth = getAuth(firebaseApp) as Auth;
export { firebaseApp, firebaseAuth };
