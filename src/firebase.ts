import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDnEKPWtt0bnvJjUqB0bEoFCqAHLun3s6c",
  authDomain: "scheduler-25e84.firebaseapp.com",
  projectId: "scheduler-25e84",
  storageBucket: "scheduler-25e84.firebasestorage.app",
  messagingSenderId: "1004767918440",
  appId: "1:1004767918440:web:0d44a484d4a1b5a800bedd"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
