/**
 * Sign-in check for the Google Drive upload script (Phase 0, Oct 2026).
 *
 * The upload script's web-app URL is in this public repo, so until now anyone who had it could put files in
 * the company's Drive. FleetGuard and the Orders page now send the person's Firebase sign-in token with every
 * upload (field "idToken"); this checks it and accepts the file only from an ACTIVE account with FleetGuard or
 * Orders ticked in Settings → Users — the same record the database rules use.
 *
 * HOW TO INSTALL (script.google.com → the upload project):
 *   1. Add a new file, paste this whole file in.
 *   2. At the top of doPost(e), right after the request body is read into a variable (called `body` below):
 *
 *        var refused = checkSignedIn_(body);
 *        if (refused) return ContentService.createTextOutput(JSON.stringify({ success: false, error: refused }))
 *                                          .setMimeType(ContentService.MimeType.JSON);
 *
 *   3. Deploy → Manage deployments → edit the existing deployment → Version: New version → Deploy.
 *      (Editing the EXISTING deployment keeps the same URL; a brand-new deployment would change it.)
 *   4. Upload a photo in FleetGuard and on the Orders page to check, then try the URL without signing in.
 */

var FIREBASE_API_KEY = 'AIzaSyAilKo_Lc2SWlxDrRQrzjHhqrf6oH0k824';   // the public web key from js/config.js
var FIREBASE_DB_URL = 'https://rag-os-e9382-default-rtdb.firebaseio.com';

/** '' when the upload may go ahead, otherwise the reason shown to the person. */
function checkSignedIn_(body) {
  var token = body && body.idToken;
  if (!token) return 'Uploads now need you to be signed in. Reload the page, sign in again and retry.';

  // Google checks the token (signature, expiry, project) and says whose it is.
  var who = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true
  });
  if (who.getResponseCode() !== 200) return 'Your sign-in has expired. Reload the page, sign in again and retry.';
  var account = (JSON.parse(who.getContentText()).users || [])[0];
  if (!account || !account.localId) return 'Your sign-in could not be checked. Sign in again and retry.';

  // Read the person's own users/<uid> record AS them — the database rules allow exactly that.
  var rec = UrlFetchApp.fetch(FIREBASE_DB_URL + '/users/' + encodeURIComponent(account.localId) + '.json?auth=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (rec.getResponseCode() !== 200) return 'This account may not upload files.';
  var u = JSON.parse(rec.getContentText());
  if (!u) return 'This account has no access yet. Ask the administrator.';
  if (u.active === false) return 'This account has been turned off. Ask the administrator.';

  // Same reading of the page ticks as userPages() in js/app.js and accessPages() in orders-page.html.
  var p = (u.pages && typeof u.pages === 'object') ? u.pages : null;
  var hasAccess = u.role === 'Admin' || !p || (u.via === 'Orders page' && !u.pagesSetAt) || p.fleetguard === true || p.orders === true;
  return hasAccess ? '' : 'This account has no access yet. Ask the administrator.';
}
