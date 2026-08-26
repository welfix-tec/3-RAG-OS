  // Paste your deployed Google Apps Script Web App URL here.
  window.GOOGLE_APPS_SCRIPT_UPLOAD_URL = 'https://script.google.com/macros/s/AKfycbwDl0DgjPLh_1-uPD3qvjPUbLpWai0pBNO2OW0rd8zYWob1ysBki2WxYL8s6OnQNd01/exec';

  var firebaseConfig = {
    apiKey: "AIzaSyAilKo_Lc2SWlxDrRQrzjHhqrf6oH0k824",
    authDomain: "rag-os-e9382.firebaseapp.com",
    databaseURL: "https://rag-os-e9382-default-rtdb.firebaseio.com",
    projectId: "rag-os-e9382",
    storageBucket: "rag-os-e9382.firebasestorage.app",
    messagingSenderId: "522385154864",
    appId: "1:522385154864:web:1af1905244f3b7144b9ef5",
    measurementId: "G-D5FD4ZNBCF"
  };

  firebase.initializeApp(firebaseConfig);
  window.database = firebase.database();
  window.auth = firebase.auth();

  // Monitor authorization state automatically
  let appInitialized = false;

  window.auth.setPersistence(firebase.auth.Auth.Persistence.NONE)
      .then(() => {
          // Force sign out on page load to ensure re-authentication every refresh
          window.auth.signOut().then(() => {
              window.auth.onAuthStateChanged((user) => {
                  const overlay = document.getElementById('auth-overlay');
                  if (user) {
                      console.log("[Security] Dispatcher authenticated:", user.email);
                      overlay.style.display = 'none';

                      const rolePromise = (window.App && typeof App.loadUserRoleFromFirebase === 'function')
                          ? App.loadUserRoleFromFirebase(user.uid)
                          : Promise.resolve(null);

                      rolePromise.finally(() => {
                          if (!appInitialized && window.App && typeof window.App.init === 'function') {
                              appInitialized = true;
                              App.init();
                          }
                      });
                  } else {
                      appInitialized = false;
                      overlay.style.display = 'flex';
                  }
              });
          });
      });

  // Toggle Password Visibility
  function togglePasswordVisibility() {
      const input = document.getElementById('login-password');
      const btn = document.getElementById('toggle-password-btn');
      if (input.type === 'password') {
          input.type = 'text';
          btn.textContent = '🙈';
          btn.title = 'Hide password';
      } else {
          input.type = 'password';
          btn.textContent = '👁';
          btn.title = 'Show password';
      }
  }

  // Login Execution Engine
  async function handleAuthLogin(event) {
      if (event) event.preventDefault();
      
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('auth-error');
      const btn = document.getElementById('btn-login');
      
      if (!email || !password) {
          errorEl.textContent = "Please fill in all security fields.";
          errorEl.style.display = "block";
          return;
      }
      
      try {
          btn.textContent = "Verifying Credentials...";
          btn.disabled = true;
          errorEl.style.display = "none";
          
          await window.auth.signInWithEmailAndPassword(email, password);
      } catch (error) {
          console.error("Login Failure:", error);
          errorEl.textContent = "Access Denied: Invalid email or password confirmation.";
          errorEl.style.display = "block";
          btn.textContent = "Initialize Control Center";
          btn.disabled = false;
      }
  }

  console.log("[Firebase] Realtime Database connected — project: rag-os-e9382");