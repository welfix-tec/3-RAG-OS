/*
 * Tests for database.rules.json against the Firebase emulator. Run from rules/: npm test
 * Each write below is the same call the pages make (js/app.js, orders-page.html), so a rule that
 * would break a page fails here first.
 */
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');

let env;
const T = 1760000000000;
const people = {
  admin: { email: 'admin@3rag.rw', role: 'Admin', pages: { fleetguard: true, orders: true }, pagesSetAt: T, active: true },
  fg: { email: 'fg@3rag.rw', role: 'Supervisor', pages: { fleetguard: true, orders: false }, pagesSetAt: T, active: true },
  ord: { email: 'ord@3rag.rw', role: 'Driver', pages: { fleetguard: false, orders: true }, pagesSetAt: T, active: true },
  both: { email: 'both@3rag.rw', role: 'Mechanic', pages: { fleetguard: true, orders: true }, pagesSetAt: T, active: true },
  legacyFg: { email: 'old@3rag.rw', role: 'Mechanic', active: true },
  legacyOrd: { email: 'oldord@3rag.rw', role: 'Driver', pages: { fleetguard: false, orders: false }, via: 'Orders page', active: true },
  noRole: { email: 'norole@3rag.rw', pages: { fleetguard: true, orders: false }, pagesSetAt: T, active: true },
  off: { email: 'off@3rag.rw', role: 'Admin', pages: { fleetguard: true, orders: true }, pagesSetAt: T, active: false },
  waiting: { email: 'waiting@3rag.rw', role: 'Driver', pages: { fleetguard: false, orders: false }, pagesSetAt: T, active: true },
};
const db = uid => env.authenticatedContext(uid, { email: (people[uid] || { email: uid + '@3rag.rw' }).email }).database();
const anon = () => env.unauthenticatedContext().database();

before(async () => {
  const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-fleetguard',
    database: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', '..', 'database.rules.json'), 'utf8') },
  });
});
after(() => env && env.cleanup());
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(ctx => ctx.database().ref().set({
    users: people,
    fleetguard: {
      trucks: [{ plate: 'RAJ 248 Q', trailer: 'T1' }], drivers: [{ id: 'd1', name: 'Jean' }], trailers: [{ id: 'T1' }],
      settings: { pinHash: 'h', pinSalt: 's', company: '3 RAG', locale: { dateFormat: 'DD/MM/YYYY' } },
      opsOrders: { o1: { id: 'o1', client: 'VIVO' } }, opsSettings: { roadStatuses: ['x'] },
      offloadReports: { o1__t1: { orderId: 'o1', tripId: 't1' } }, attentionRequests: { RAJ248Q: { plate: 'RAJ 248 Q' } },
      financePin: { hash: 'fh', salt: 'fs' }, auditTrail: [{ a: 1 }], lastUpdated: T,
    },
  }));
});

// ── Signed out, unknown and switched-off accounts see nothing ─────────────────────────────
test('signed out: nothing', async () => {
  await assertFails(anon().ref('fleetguard').once('value'));
  await assertFails(anon().ref('users').once('value'));
  await assertFails(anon().ref('fleetguard/trucks').once('value'));
});
test('account with no record: nothing to read', async () => {
  await assertFails(db('stranger').ref('fleetguard').once('value'));
  await assertFails(db('stranger').ref('fleetguard/trucks').once('value'));
  await assertFails(db('stranger').ref('fleetguard/financePin').once('value'));
  await assertFails(db('stranger').ref('users').once('value'));
});
test('turned-off account: nothing, even with the Admin role', async () => {
  await assertFails(db('off').ref('fleetguard').once('value'));
  await assertFails(db('off').ref('fleetguard/opsOrders').once('value'));
  await assertFails(db('off').ref('users').once('value'));
  await assertFails(db('off').ref('users/fg/active').set(false));
});
test('account waiting for access: nothing', async () => {
  await assertFails(db('waiting').ref('fleetguard').once('value'));
  await assertFails(db('waiting').ref('fleetguard/opsOrders').once('value'));
  await assertSucceeds(db('waiting').ref('users/waiting').once('value'));
});

// ── First sign-in: register itself with no access, and nothing more ────────────────────────
const fgFirst = email => ({ email, role: 'Driver', pages: { fleetguard: false, orders: false }, pagesSetAt: T, pagesSetBy: 'first sign-in (no access yet)', active: true, firstSeen: T, via: 'FleetGuard' });
test('first sign-in: registers itself exactly as FleetGuard and the Orders page do', async () => {
  await assertSucceeds(db('new1').ref('users/new1').set(fgFirst('new1@3rag.rw')));
  await assertSucceeds(db('new2').ref('users/new2').set({ ...fgFirst('new2@3rag.rw'), via: 'Orders page' }));
});
test('first sign-in: cannot give itself access, a role, or someone else\'s record', async () => {
  const r = fgFirst('new1@3rag.rw');
  await assertFails(db('new1').ref('users/new1').set({ ...r, pages: { fleetguard: true, orders: false } }));
  await assertFails(db('new1').ref('users/new1').set({ ...r, pages: { fleetguard: false, orders: true } }));
  await assertFails(db('new1').ref('users/new1').set({ ...r, role: 'Admin' }));
  await assertFails(db('new1').ref('users/new1').set({ ...r, pages: null }));                       // no ticks = FleetGuard (older records)
  await assertFails(db('new1').ref('users/new1').set({ ...r, via: 'Orders page', pagesSetAt: null })); // = Orders only (older records)
  await assertFails(db('new1').ref('users/new1').set({ ...r, email: 'admin@3rag.rw' }));
  await assertFails(db('new1').ref('users/new9').set({ ...fgFirst('new1@3rag.rw') }));
});
test('a registered account cannot raise its own access', async () => {
  await assertFails(db('waiting').ref('users/waiting').update({ role: 'Admin' }));
  await assertFails(db('waiting').ref('users/waiting/pages').set({ fleetguard: true, orders: true }));
  await assertFails(db('waiting').ref('users/waiting').set({ ...people.waiting, pages: { fleetguard: true, orders: true } }));
  await assertFails(db('fg').ref('users/fg/role').set('Admin'));
  await assertFails(db('fg').ref('users/fg/active').set(true));
});
test('older record without a role: given Driver at sign-in (js/app.js), never more', async () => {
  await assertSucceeds(db('noRole').ref('users/noRole').update({ role: 'Driver', email: 'norole@3rag.rw', firstSeen: T }));
  await env.withSecurityRulesDisabled(ctx => ctx.database().ref('users/noRole/role').remove());
  await assertFails(db('noRole').ref('users/noRole').update({ role: 'Admin', email: 'norole@3rag.rw', firstSeen: T }));
});

// ── FleetGuard accounts ───────────────────────────────────────────────────────────────────
test('FleetGuard: reads the whole tree and its own record, not the users list', async () => {
  for (const u of ['fg', 'legacyFg', 'noRole', 'admin', 'both']) await assertSucceeds(db(u).ref('fleetguard').once('value'));
  await assertSucceeds(db('fg').ref('users/fg').once('value'));
  await assertFails(db('fg').ref('users').once('value'));
  await assertFails(db('fg').ref('users/ord').once('value'));
});
test('FleetGuard: saveAll() multi-collection update works', async () => {
  await assertSucceeds(db('fg').ref('fleetguard').update({
    trucks: [{ plate: 'RAB 118 D' }], drivers: [], jobCards: [{ id: 'JC1' }], auditTrail: [{ a: 2 }],
    settings: { pinHash: 'h', pinSalt: 's', company: '3 RAG Co', locale: { dateFormat: 'YYYY-MM-DD' } },
    brandNewThing: { x: 1 }, lastUpdated: T + 1,
  }));
});
test('FleetGuard: cannot change the admin PIN or the Finance PIN — Admin can', async () => {
  await assertFails(db('fg').ref('fleetguard').update({ settings: { pinHash: 'mine', pinSalt: 's' } }));
  await assertFails(db('fg').ref('fleetguard/settings/pinHash').set('mine'));
  await assertFails(db('fg').ref('fleetguard/financePin').set({ hash: 'x', salt: 'y' }));
  await assertSucceeds(db('admin').ref('fleetguard').update({ settings: { pinHash: 'new', pinSalt: 'new' } }));
  await assertSucceeds(db('admin').ref('fleetguard/financePin').set({ hash: 'x', salt: 'y', setAt: T }));
});
test('FleetGuard: files offload reports and clears attention requests, but never writes orders', async () => {
  await assertSucceeds(db('fg').ref('fleetguard/offloadReports/o1__t2').set({ orderId: 'o1', tripId: 't2' }));
  await assertSucceeds(db('fg').ref('fleetguard/offloadReports/o1__t1').update({ originalAt: 'inhand' }));
  await assertSucceeds(db('fg').ref('fleetguard/attentionRequests/RAJ248Q').remove());
  await assertFails(db('fg').ref('fleetguard/opsOrders/o1').set({ id: 'o1' }));
  await assertFails(db('fg').ref('fleetguard/opsSettings').set({}));
});

// ── Orders page accounts ──────────────────────────────────────────────────────────────────
test('Orders: reads exactly what the Orders page listens to', async () => {
  for (const u of ['ord', 'legacyOrd']) {
    for (const p of ['trucks', 'drivers', 'trailers', 'opsOrders', 'opsSettings', 'offloadReports', 'attentionRequests', 'financePin', 'settings/locale/dateFormat']) {
      await assertSucceeds(db(u).ref('fleetguard/' + p).once('value'));
    }
  }
});
test('Orders: cannot read the rest of FleetGuard (admin PIN, job cards, audit trail)', async () => {
  await assertFails(db('ord').ref('fleetguard').once('value'));
  await assertFails(db('ord').ref('fleetguard/settings').once('value'));
  await assertFails(db('ord').ref('fleetguard/settings/pinHash').once('value'));
  await assertFails(db('ord').ref('fleetguard/jobCards').once('value'));
  await assertFails(db('ord').ref('fleetguard/auditTrail').once('value'));
  await assertFails(db('legacyOrd').ref('fleetguard').once('value'));
});
test('Orders: writes orders, settings, attention requests and the PIN lock — nothing else', async () => {
  await assertSucceeds(db('ord').ref('fleetguard/opsOrders/o2').set({ id: 'o2', client: 'RUBIS' }));
  await assertSucceeds(db('ord').ref('fleetguard/opsOrders/o1').remove());
  await assertSucceeds(db('ord').ref('fleetguard/opsSettings').set({ roadStatuses: [] }));
  await assertSucceeds(db('ord').ref('fleetguard/attentionRequests/RAB118D').set({ plate: 'RAB 118 D' }));
  await assertSucceeds(db('ord').ref('fleetguard/financePin/lock').transaction(() => ({ attempts: 1, until: 0 })));
  await assertFails(db('ord').ref('fleetguard/financePin/hash').set('x'));
  await assertFails(db('ord').ref('fleetguard/trucks').set([]));
  await assertFails(db('ord').ref('fleetguard/offloadReports/o1__t1').set({}));
  await assertFails(db('ord').ref('fleetguard').update({ trucks: [] }));
});

// ── Admin ─────────────────────────────────────────────────────────────────────────────────
test('Admin: manages Settings → Users exactly as FleetGuard does', async () => {
  await assertSucceeds(db('admin').ref('users').once('value'));
  await assertSucceeds(db('admin').ref('users/waiting').update({ pages: { fleetguard: true, orders: false }, pagesSetAt: T, pagesSetBy: 'admin' }));
  await assertSucceeds(db('admin').ref('users/fg').update({ active: false }));
  await assertSucceeds(db('admin').ref('users/fg').update({ role: 'Mechanic' }));
  await assertSucceeds(db('admin').ref('users/brandNew').set({ email: 'x@3rag.rw', name: 'X', role: 'Driver', pages: { fleetguard: true, orders: false }, pagesSetAt: T, active: true, createdAt: T }));
});
test('nothing at the root', async () => {
  await assertFails(db('admin').ref().once('value'));
  await assertFails(db('admin').ref('elsewhere').set(1));
});
