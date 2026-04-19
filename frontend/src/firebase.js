import { initializeApp } from 'firebase/app';
import { getFunctions } from 'firebase/functions';

// Mock Firebase config for build purposes
const firebaseConfig = {
  apiKey: "mock-key",
  authDomain: "mock-domain.firebaseapp.com",
  projectId: "projeto-codex-br",
  storageBucket: "mock-bucket.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
export const functions = getFunctions(app, 'us-central1');
