const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

function harness({ denied = false, status = 'with_doctor', records = {}, rows = [{ vn: 'TEST' }] } = {}) {
    const updates = [], filters = [];
    const chain = {
        select() { return chain; },
        eq(...args) { filters.push(['eq', ...args]); return chain; },
        is(...args) { filters.push(['is', ...args]); return chain; },
        single: async () => ({ data: { aesthetic_records: records, status, service_category: 'aesthetic' } }),
        update(data) { updates.push(data); return chain; },
        then(resolve) { return Promise.resolve({ data: rows }).then(resolve); },
    };
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync('lib/actions/visit-workspace.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInNewContext(source, {
        exports, TextEncoder, crypto: webcrypto,
        require(name) {
            if (name === '@/lib/supabase/server') return { createClient: async () => ({ from: () => chain }) };
            if (name === '@/lib/auth/permissions') return { getEffectivePermissionsForUser: async () => ({ userId: 'user', clinicId: 'clinic', isApproved: true, isActive: true, permissions: { 'visits.edit': !denied } }) };
            if (name === 'next/cache') return { revalidatePath() {} };
            if (name === '@/lib/visit-workspace-types') return { BODY_CHART_BACKGROUND: 'body-template' };
            throw Error(name);
        },
    });
    return { save: exports.saveVisitWorkspace, updates, filters };
}
const input = () => ({ notes: 'new note', sheets: [{ id: 1, name: 'Face', background: '/face-chart.png', strokes: [], pins: [{ id: 2, x: 100, y: 200, amount: '0.2', color: '#2563eb' }] }], revision: null, previousNotes: '' });

test('save preserves legacy records and scopes writes to clinic, visit, status and revision', async () => {
    const h = harness({ records: { photos: { before: [] }, face_chart: { pins: [] } } });
    assert.equal((await h.save('TEST', input())).success, true);
    assert.deepEqual(h.updates[0].aesthetic_records.photos, { before: [] });
    assert.equal(h.updates[0].aesthetic_records.workspace_sheets[0].pins[0].amount, '0.2');
    for (const expected of [['eq', 'clinic_id', 'clinic'], ['eq', 'vn', 'TEST'], ['eq', 'status', 'with_doctor'], ['is', 'aesthetic_records->>workspace_revision', null]]) assert.ok(h.filters.some(f => JSON.stringify(f) === JSON.stringify(expected)));
});
test('denied users cannot write', async () => {
    const h = harness({ denied: true }); assert.equal((await h.save('TEST', input())).success, false); assert.equal(h.updates.length, 0);
});
test('closed and cancelled visits cannot write', async () => {
    for (const status of ['completed', 'cancelled', 'waiting_payment']) { const h = harness({ status }); assert.equal((await h.save('TEST', input())).success, false); assert.equal(h.updates.length, 0); }
});
test('stale notes and revisions fail without overwriting', async () => {
    for (const records of [{ treatment_notes: 'changed elsewhere' }, { workspace_revision: 'new-version' }]) { const h = harness({ records }); assert.equal((await h.save('TEST', input())).success, false); assert.equal(h.updates.length, 0); }
});
test('cross-visit image paths and invalid cc fail validation', async () => {
    for (const patch of [{ storagePath: 'other-clinic/visits/TEST/workspace/a.jpg' }, { storagePath: 'clinic/visits/OTHER/workspace/a.jpg' }, { pins: [{ id: 1, x: 0, y: 0, amount: '-1', color: '#2563eb' }] }]) {
        const h = harness(), value = input(); Object.assign(value.sheets[0], patch); assert.equal((await h.save('TEST', value)).success, false); assert.equal(h.updates.length, 0);
    }
});
test('zero updated rows reports conflict instead of false success', async () => {
    const h = harness({ rows: [] }); assert.equal((await h.save('TEST', input())).success, false);
});
test('signed URLs are not persisted; the authorized storage path is retained', async () => {
    const h = harness(), value = input(); Object.assign(value.sheets[0], { storagePath: 'clinic/visits/TEST/workspace/a.jpg', background: 'https://temporary.invalid/signed' });
    assert.equal((await h.save('TEST', value)).success, true); assert.equal(h.updates[0].aesthetic_records.workspace_sheets[0].background, '');
});
