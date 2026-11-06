/* BrandGuard settings.
   1) FIREBASE: create a project at https://console.firebase.google.com, add a Web app, enable
      Authentication (Email/Password and Google) and Firestore, then paste the web app config below.
      Leave apiKey empty to run in local demo mode (data stays in this browser).
   2) AI ENDPOINT (optional): the URL of the deployed Cloud Function in functions/index.js.
      Leave empty to use the Admin-managed Gemini keys in the browser. See README.md. */
window.BG_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDitUTYu_c_L-cv6IT_Gpid4-PrJZkWngE",
    authDomain: "brandguard-e9a57.firebaseapp.com",
    projectId: "brandguard-e9a57",
    storageBucket: "brandguard-e9a57.firebasestorage.app",
    messagingSenderId: "605983610820",
    appId: "1:605983610820:web:92ba48d76ae7a4a366b691",
    measurementId: "G-9J1R0EHGTH"
  },
  aiEndpoint: "/api/gemini"
};
