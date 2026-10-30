/*
 * Builds database.rules.json — the Firebase Realtime Database rules for FleetGuard and the Orders page.
 *
 *   cd rules && node build-rules.cjs        (then: npm test)
 *
 * Firebase rules have no functions, so the same access checks would be pasted into a dozen places.
 * They are written once here and the JSON is generated. Edit THIS file, never database.rules.json.
 *
 * Who may do what is decided by users/<uid>, the record FleetGuard → Settings → Users edits, with the
 * SAME meaning as userPages() in js/app.js and accessPages() in orders-page.html:
 *   - no record, or active === false            → nothing
 *   - record without page ticks (older)         → FleetGuard only
 *   - registered by the Orders page, ticks never set by the admin (no pagesSetAt) → Orders only
 *   - otherwise                                  → the ticks: pages.fleetguard / pages.orders
 *   - role Admin                                 → always FleetGuard, and the only role that manages Users
 */
const fs = require('fs');
const path = require('path');

const me = "root.child('users').child(auth.uid)";
const signedIn = 'auth != null';
const active = `${me}.exists() && ${me}.child('active').val() !== false`;
const isAdmin = `(${signedIn} && ${active} && ${me}.child('role').val() === 'Admin')`;
const hasTicks = `${me}.child('pages').hasChildren()`;
const ordersOnlyLegacy = `(${me}.child('via').val() === 'Orders page' && !${me}.child('pagesSetAt').exists())`;
const fleetguard = `(${signedIn} && ${active} && (${me}.child('role').val() === 'Admin' || !${hasTicks} || (!${ordersOnlyLegacy} && ${me}.child('pages/fleetguard').val() === true)))`;
const orders = `(${signedIn} && ${active} && ${hasTicks} && (${ordersOnlyLegacy} || ${me}.child('pages/orders').val() === true))`;
const either = `(${fleetguard} || ${orders})`;

// A first sign-in registers its own record with NO access (js/app.js loadUserRoleFromFirebase,
// orders-page.html ordersAccess). Only that exact shape is allowed: ticks off, set-at stamped (so the
// "Orders only" legacy reading can never apply), role Driver, active, its own e-mail.
const selfRegister = [
  'auth.uid === $uid',
  '!data.exists()',
  "newData.child('role').val() === 'Driver'",
  "newData.child('active').val() === true",
  "newData.child('pages/fleetguard').val() === false",
  "newData.child('pages/orders').val() === false",
  "newData.child('pagesSetAt').isNumber()",
  "newData.child('email').val() === auth.token.email",
].join(' && ');

// The admin PIN lives in fleetguard/settings, which FleetGuard writes as a whole. Unchanged is fine
// for anyone with FleetGuard; only an Admin may set or change it.
const adminOnlyChange = { '.validate': `newData.val() === data.val() || ${isAdmin}` };

// Everything FleetGuard saves through saveAll() (FB_COLLECTIONS in js/app.js) plus lastUpdated.
const fleetguardCollections = ['drivers', 'trucks', 'trailers', 'orders', 'jobCards', 'recycleBin',
  'hscPolicies', 'hscMeetings', 'incidents', 'auditTrail', 'lastUpdated'];

const fg = {
  // FleetGuard listens to the whole tree; the Orders page only to the parts below.
  '.read': fleetguard,

  // The fleet — the Orders page reads it to nominate trucks.
  ...Object.fromEntries(fleetguardCollections.map(c => [c, ['drivers', 'trucks', 'trailers'].includes(c)
    ? { '.read': orders, '.write': fleetguard }
    : { '.write': fleetguard }])),

  settings: {
    '.write': fleetguard,
    pinHash: adminOnlyChange,
    pinSalt: adminOnlyChange,
    // The Orders page follows FleetGuard's date format.
    locale: { '.read': orders },
  },

  // Orders: written only by the Orders page; FleetGuard shows them (it reads the whole tree).
  opsOrders: { '.read': orders, '.write': orders },
  opsSettings: { '.read': orders, '.write': orders },

  // Offload reports: filled in FleetGuard, taken into the order on the Orders page.
  offloadReports: { '.read': orders, '.write': fleetguard },

  // "?" on the nomination list: the Orders page asks, FleetGuard clears it once the truck is fixed.
  attentionRequests: { '.read': orders, '.write': either },

  // Finance PIN: only its one-way hash. Set or changed by an Admin in FleetGuard; the Orders page
  // checks it and counts wrong tries in lock/.
  financePin: {
    '.read': orders,
    '.write': isAdmin,
    lock: { '.write': either },
  },

  // Anything else under fleetguard: as before, any FleetGuard account.
  $other: { '.write': fleetguard },
};

const rules = {
  rules: {
    '.read': false,
    '.write': false,
    users: {
      '.read': isAdmin,
      $uid: {
        '.read': `auth.uid === $uid || ${isAdmin}`,
        '.write': `${isAdmin} || (${selfRegister})`,
        // An older record without a role is given Driver at sign-in (js/app.js) — that, and nothing more.
        role: { '.write': "auth.uid === $uid && !data.exists() && newData.val() === 'Driver'" },
        email: { '.write': 'auth.uid === $uid && newData.val() === auth.token.email' },
        firstSeen: { '.write': 'auth.uid === $uid && newData.isNumber()' },
      },
    },
    fleetguard: fg,
  },
};

const out = path.join(__dirname, '..', 'database.rules.json');
fs.writeFileSync(out, JSON.stringify(rules, null, 2) + '\n');
console.log('Wrote', path.relative(process.cwd(), out));
