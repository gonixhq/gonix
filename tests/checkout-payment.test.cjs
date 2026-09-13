const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const mod = { exports: {} };
const js = ts.transpileModule(fs.readFileSync('lib/checkout-payment.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(js, { exports: mod.exports });
const { paymentPlan, validatePayments } = mod.exports;
const row = (method, amount) => ({ method, amount });
const draft = (rows, mode='full', deposit='') => ({ rows, mode, deposit });
test('เงินสด+โอน+บัตรรวมตามบิล', () => {
 const p = paymentPlan(5000, draft([row('cash','1000'),row('transfer','1500'),row('credit_card','2500')]));
 assert.equal(p.paid,5000); assert.equal(p.outstanding,0); assert.equal(p.payments.length,3);
 validatePayments(5000,p.paid,p.payments);
});
test('มัดจำ 2000 ด้วยสองช่องทาง เหลือ 3000', () => {
 const p=paymentPlan(5000,draft([row('cash','500'),row('transfer','1500')],'deposit','2000'));
 assert.equal(p.paid,2000);assert.equal(p.outstanding,3000);assert.equal(p.change,0);
});
test('เงินทอนหักเฉพาะเงินสด ไม่หักยอดโอน', () => {
 const p=paymentPlan(220,draft([row('transfer','100'),row('cash','200')]));
 assert.equal(p.change,80);assert.equal(p.payments.find(r=>r.method==='cash').amount,120);assert.equal(p.payments.find(r=>r.method==='transfer').amount,100);
});
test('ทอนเงินสดจากยอดมัดจำ', () => {
 const p=paymentPlan(5000,draft([row('cash','2500')],'deposit','2000')); assert.equal(p.change,500);assert.equal(p.paid,2000);
});
test('สตางค์ 0.10 + 0.20 = 0.30', () => {
 const p=paymentPlan(.3,draft([row('cash','0.10'),row('transfer','0.20')]));assert.equal(p.change,0);validatePayments(.3,p.paid,p.payments);
});
test('ห้ามยอดขาด โอนเกิน ยอดติดลบ ทศนิยมเกิน และช่องทางซ้ำ', () => {
 for(const rows of [[row('cash','100')],[row('transfer','221')],[row('cash','-1')],[row('cash','220.001')],[row('cash','NaN')],[row('cash','220'),row('cash','1')]]) assert.throws(()=>paymentPlan(220,draft(rows)));
});
test('มัดจำต้องต่ำกว่ายอดบิลและมากกว่า 0',()=>{for(const n of ['0','220','2000',''])assert.throws(()=>paymentPlan(220,draft([row('cash',n)],'deposit',n)));});
test('ค้างทั้งหมดและบิลยอดศูนย์',()=>{
 assert.equal(paymentPlan(220,draft([],'unpaid')).outstanding,220);
 assert.equal(paymentPlan(0,draft([row('cash','0')])).paid,0);
 validatePayments(0,0,[]);
});
test('server ปฏิเสธยอดแยกไม่ตรง ยอดเกิน และวิธีผิด',()=>{
 assert.throws(()=>validatePayments(5000,2000,[{method:'cash',amount:1999}]));
 assert.throws(()=>validatePayments(5000,6000,[{method:'cash',amount:6000}]));
 assert.throws(()=>validatePayments(5000,2000,[{method:'unknown',amount:2000}]));
});
