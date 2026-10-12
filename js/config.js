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

  // The sign-in box starts hidden and the loader shows while Firebase restores a saved
  // session — a refresh no longer flashes the sign-in screen at someone who is signed in.
  // If Firebase has not answered after 10 s (offline, blocked), show the sign-in box anyway.
  let authAnswered = false;
  setTimeout(() => {
      if (authAnswered) return;
      const overlay = document.getElementById('auth-overlay');
      const loader = document.getElementById('app-loading-msg');
      if (loader) loader.style.display = 'none';
      if (overlay) overlay.style.display = 'flex';
  }, 10000);

  // Oct 2026: sign in every time the page is opened — the session lives in this tab only and closing the tab signs out
  // (SESSION). A new tab asks again. "Sign out" in the sidebar footer still signs out at once.
  window.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
      .catch((err) => console.warn('[Auth] persistence not available, falling back to default', err))
      .then(() => {
          window.auth.onAuthStateChanged((user) => {
              authAnswered = true;
              const overlay = document.getElementById('auth-overlay');
              if (user) {
                  console.log("[Security] Dispatcher authenticated:", user.email);
                  if (overlay) overlay.style.display = 'none';
                  // Show the loading spinner straight after sign-in, until live data arrives.
                  const loader = document.getElementById('app-loading-msg');
                  if (loader) loader.style.display = 'flex';

                  const rolePromise = (window.App && typeof App.loadUserRoleFromFirebase === 'function')
                      ? App.loadUserRoleFromFirebase(user.uid)
                      : Promise.resolve(null);

                  rolePromise.finally(() => {
                      if (window.__fgAccessDenied) return;   // turned off, or not allowed on FleetGuard (Settings → Users)
                      if (!appInitialized && window.App && typeof window.App.init === 'function') {
                          appInitialized = true;
                          App.init();
                      }
                  });
              } else {
                  appInitialized = false;
                  const loader = document.getElementById('app-loading-msg');
                  if (loader) loader.style.display = 'none';
                  if (overlay) overlay.style.display = 'flex';
              }
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
      
      window.__fgAccessDenied = false;
      try {
          btn.textContent = "Verifying Credentials...";
          btn.disabled = true;
          errorEl.style.display = "none";
          
          await window.auth.signInWithEmailAndPassword(email, password);
      } catch (error) {
          console.error("Login Failure:", error);
          errorEl.textContent = "Access Denied: Invalid email or password confirmation.";
          errorEl.style.display = "block";
          btn.textContent = "Sign in";
          btn.disabled = false;
      }
  }

  console.log("[Firebase] Realtime Database connected — project: rag-os-e9382");