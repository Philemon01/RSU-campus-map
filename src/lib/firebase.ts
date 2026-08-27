import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfigLocal from '../../firebase-applet-config.json';

// Silence non-critical offline connection notifications from Firestore SDK
setLogLevel('error');

// Allow overriding via environment variables (vital for custom production/Vercel hosting)
const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigLocal.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigLocal.appId,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigLocal.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigLocal.authDomain,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigLocal.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigLocal.messagingSenderId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigLocal.measurementId,
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events');

let cachedAccessToken: string | null = null;

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      try {
        localStorage.setItem('rsu_google_access_token', token);
        localStorage.setItem('rsu_google_access_token_time', Date.now().toString());
      } catch (e) {
        console.error("Failed to write token to localStorage", e);
      }
    } else {
      try {
        localStorage.removeItem('rsu_google_access_token');
        localStorage.removeItem('rsu_google_access_token_time');
      } catch (e) {
        console.error("Failed to clear token in localStorage", e);
      }
    }
  }
};

export const getCachedAccessToken = (): string | null => {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }
  if (typeof window !== 'undefined') {
    try {
      const token = localStorage.getItem('rsu_google_access_token');
      const timeStr = localStorage.getItem('rsu_google_access_token_time');
      if (token && timeStr) {
        const age = Date.now() - parseInt(timeStr, 10);
        // Google tokens are generally valid for 1 hour. We cache it for up to 55 minutes (3,300,000 milliseconds)
        if (age < 3300000) {
          cachedAccessToken = token;
          return token;
        }
      }
    } catch (e) {
      console.error("Failed to read token from localStorage", e);
    }
  }
  return null;
};
