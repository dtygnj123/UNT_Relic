// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB2NrqPMMCL_6eoPpcLJnciHP2l-2gb8pY",
  authDomain: "c09uoftnotears.firebaseapp.com",
  projectId: "c09uoftnotears",
  storageBucket: "c09uoftnotears.firebasestorage.app",
  messagingSenderId: "51875597432",
  appId: "1:51875597432:web:191ce2c5d2f82cd8dd318d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
