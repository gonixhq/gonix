const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/profit-report.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:m.exports});const {buildProfitReport}=m.exports;
test('uses net invoice totals, excludes draft/void/refund and their costs',()=>{
 const invoices=['paid','partial','draft','voided','refunded'].map((status,id)=>({id:String(id),status,total_amount:'90.10'}));
 const items=invoices.map(i=>({inv_id:i.id,item_type:'drug',cogs_amount:'20.20',df_amount:'5.05'}));
 const r=buildProfitReport(invoices,items,[],[],[]);assert.equal(r.sales,180.20);assert.equal(r.cogs,40.40);assert.equal(r.df,10.10);assert.equal(r.invoiceCount,2);
});
test('anonymous receipts included once; old bill collection and refunds use cash basis separately',()=>{
 const r=buildProfitReport([{id:'1',status:'paid',total_amount:100}],[],[{total_amount:20}],[],[{amount:200},{amount:-50}]);assert.equal(r.sales,120);assert.equal(r.cashReceived,170);assert.equal(r.anonymousCount,1);assert.equal(r.invoicesWithoutItems,1);
});
test('zero and null costs stay unverified and expenses are not double counted as cost',()=>{
 const r=buildProfitReport([{id:'1',status:'paid',total_amount:100}],[{inv_id:'1',item_type:'drug',cogs_amount:0,df_amount:null},{inv_id:'1',item_type:'package',cogs_amount:null,df_amount:0}],[],[{category:'ซื้อสินค้า',amount:0.1},{category:'ซื้อสินค้า',amount:0.2}],[]);
 assert.equal(r.unverifiedCosts,2);assert.equal(r.unverifiedDf,2);assert.equal(r.packageCount,1);assert.equal(r.cogs,0);assert.equal(r.expenses,0.3);assert.equal(r.expenseGroups[0].amount,0.3);assert.equal(r.netProfit,undefined);
});
