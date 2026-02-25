import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Firebase configuration.
 *
 * Replace the placeholder values below with the config from your
 * Firebase Console → Project settings → Your apps → Web app.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyBQdReyTcYopxV8c7vY00FYwM0B34FuYF0',
  authDomain: 'planetary-transit-graphics.firebaseapp.com',
  projectId: 'planetary-transit-graphics',
  storageBucket: 'planetary-transit-graphics.firebasestorage.app',
  messagingSenderId: '714563564652',
  appId: '1:714563564652:web:13f043889a0835d972d449',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
