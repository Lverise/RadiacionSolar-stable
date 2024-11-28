import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyA-q3-wmDd7dGujM5s2NviV2kFwSXpjkIs",
    authDomain: "api-radiacion-solar.firebaseapp.com",
    projectId: "api-radiacion-solar",
    storageBucket: "api-radiacion-solar.firebasestorage.app",
    messagingSenderId: "696493341457",
    appId: "1:696493341457:web:0a9f0d274449ac43f5eab0",
    measurementId: "G-1LKV6P3QN8"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
