const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// รันโค้ดจริงด้วยข้อมูลจำลอง ไม่เชื่อมฐานข้อมูลหรือบันทึกการชำระเงินจริง
function load(path, mocks) {
    const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
        fileName: path,
    }).outputText;
    const exports = {};
    vm.runInNewContext(js, { exports, require: id => id in mocks ? mocks[id] : require(id) });
    return exports;
}

function database({ failRead = false, failWrite = false } = {}) {
    const patient = { hn: 'TEST-HN', first_name: 'Test', last_name: 'Fixture' };
    const rows = [
        { id: 'a', vn: 'TEST-VN', clinic_id: 'clinic-a', lab_type: 'lab', lab_name: 'CBC', status: 'ordered', patients: [patient] },
        { id: 'b', vn: 'TEST-VN', clinic_id: 'clinic-a', lab_type: null, lab_name: 'UA', status: 'resulted', patients: patient },
        { id: 'c', clinic_id: 'clinic-a', lab_type: 'package', status: 'ordered' },
        { id: 'd', clinic_id: 'clinic-b', lab_type: 'lab', status: 'ordered' },
    ];
    const db = {
        auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
        from(table) {
            let filtered = rows;
            let invalidColumn = false;
            let writing = false;
            const q = {
                select(fields) {
                    // schema lab_orders ไม่มี order_date/note ตาม migration 002
                    if (table === 'lab_orders' && /\b(order_date|note)\b/.test(fields)) invalidColumn = true;
                    return q;
                },
                eq(key, value) { if (table === 'lab_orders') filtered = filtered.filter(r => r[key] === value); return q; },
                or(filter) { assert.equal(filter, 'lab_type.is.null,lab_type.neq.package'); filtered = filtered.filter(r => r.lab_type !== 'package'); return q; },
                order(key) { if (table === 'lab_orders') assert.equal(key, 'created_at'); return q; },
                limit() { return q; },
                insert() { writing = true; return q; },
                single() { return q; },
                maybeSingle() { return q; },
                then(resolve, reject) {
                    const error = (writing ? failWrite : failRead && table === 'lab_orders') || invalidColumn;
                    const data = table === 'profiles' ? { clinic_id: 'clinic-a' }
                        : table === 'staff' ? { id: 'staff-a' }
                        : table === 'service_catalog' ? { service_name: 'CBC', item_type: 'lab', selling_price: 100 }
                        : filtered;
                    return Promise.resolve({ data: error ? null : data, error: error ? { message: 'simulated database error' } : null }).then(resolve, reject);
                },
            };
            return q;
        },
    };
    return db;
}
const labPage = 'app/(dashboard)/dashboard/lab/page.tsx';
function page(db) {
    return load(labPage, {
        '@/lib/supabase/server': { createClient: async () => db },
        '@/lib/auth/guard': { gatePermission: async key => assert.equal(key, 'lab.view') },
        './lab-client': { default: () => null },
    }).default;
}

test('Lab queue shows ordered/resulted and legacy null-type tests, excludes package charges and other clinics', async () => {
    const rendered = await page(database())();
    assert.equal(rendered.props.labOrders.length, 2);
    assert.equal(rendered.props.pending, 1);
    assert.equal(rendered.props.completed, 1);
    assert.equal(rendered.props.labOrders[0].patient.hn, 'TEST-HN');
    assert.equal(rendered.props.labOrders[1].patient.hn, 'TEST-HN');
});

test('Lab query failure is not presented as an empty queue', async () => {
    await assert.rejects(page(database({ failRead: true })), /โหลดรายการ Lab ไม่สำเร็จ/);
});

test('Failed lab insert cannot report success; successful insert refreshes the Lab queue', async () => {
    for (const failWrite of [true, false]) {
        const refreshed = [];
        const actions = load('lib/actions/lab-orders.ts', {
            '@/lib/supabase/server': { createClient: async () => database({ failWrite }) },
            'next/cache': { revalidatePath: path => refreshed.push(path) },
        });
        const promise = actions.addLabOrder('TEST-VN', 'TEST-HN', 'service-a');
        if (failWrite) {
            await assert.rejects(promise, /บันทึกรายการตรวจไม่สำเร็จ/);
            assert.equal(refreshed.length, 0);
        } else {
            assert.equal((await promise).ok, true);
            assert.ok(refreshed.includes('/dashboard/lab'));
        }
    }
});

// ดึง handler จาก AST เพื่อทดสอบลำดับ await และ navigation ของฟอร์มจริง
const checkoutPath = 'app/(dashboard)/dashboard/pharmacy/[vn]/checkout-form.tsx';
const source = ts.createSourceFile(checkoutPath, fs.readFileSync(checkoutPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleComplete') handler = node.initializer.getText(source);
    ts.forEachChild(node, find);
}
find(source);
assert.ok(handler);
async function checkout(response, overrides = {}) {
    const navigations = [], errors = [];
    let calls = 0;
    const context = {
        loading: false, saved: false, isPaymentValid: true,
        items: [{ item_type: 'lab', item_name: 'CBC', qty: 1, unit_price: 100 }],
        visit: { vn: 'TEST-VN' }, lineGross: () => 100,
        subtotal: 100, totalDiscount: 0, grandTotal: 100, received: 100,
        promo: null, discount: 0, discountReason: '', paymentMethod: 'cash', paymentRef: '', drugOrders: [],
        canBackdate: false, billDate: '', todayStr: '2026-09-07',
        setLoading() {}, setError() {}, setSaved() {},
        toast: { error: msg => errors.push(msg), success() {} },
        router: { push: path => navigations.push(path), refresh() {} },
        window: { open() { throw new Error('Popup blocked'); } },
        completeCheckout: async () => { calls++; await Promise.resolve(); return response; },
        ...overrides,
    };
    const js = ts.transpileModule(`globalThis.run = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(js, context);
    await context.run();
    return { navigations, errors, calls };
}

test('Successful payment opens its receipt even when browser popups are blocked', async () => {
    const r = await checkout({ success: true, invId: 'INV-TEST-001' });
    assert.deepEqual(r.navigations, ['/print/invoice/INV-TEST-001']);
    assert.equal(r.errors.length, 0);
});

test('Payment failure stays on checkout and displays error', async () => {
    const r = await checkout({ error: 'Payment failed' });
    assert.equal(r.navigations.length, 0);
    assert.deepEqual(r.errors, ['Payment failed']);
});

test('Already saved checkout does not submit payment again', async () => {
    const r = await checkout({}, { saved: true });
    assert.equal(r.calls, 0);
});
