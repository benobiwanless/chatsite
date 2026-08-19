// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDU0k1gR6i8mdCyPG5yl-Wf9JGyMb5M_Qw",
  authDomain: "chatsite-5848a.firebaseapp.com",
  projectId: "chatsite-5848a",
  storageBucket: "chatsite-5848a.firebasestorage.app",
  messagingSenderId: "205946782959",
  appId: "1:205946782959:web:12f349a43ec6eabaa3471a",
  measurementId: "G-20C85K5EFV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
