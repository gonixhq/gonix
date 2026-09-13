const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function compile(path, require) {
 const module={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(js,{exports:module.exports,require}); return module.exports;
}
const parser=compile('lib/drug-label-selection.ts');
const order={id:'order-1',item_id:'drug-1',qty:10,unit:'tablet',sig_text:'SIG ORIGINAL',inventory:[{item_name:'Original drug'}]};
async function render(items) {
 const calls=[];
 const db={from(table){const filters=[]; const q={};
 for(const method of ['select','eq','in','gt','not','order','limit','maybeSingle']) q[method]=(...args)=>{filters.push([method,...args]);return q};
 q.then=(resolve)=>{calls.push({table,filters});
 const data=table==='visits'?{vn:'TEST',clinic_id:'clinic-1',patients:{first_name:'TEST'}}:table==='drug_orders'?[order]:table==='inventory'?[{id:'drug-2',item_name:'Added drug',unit:'tablet'}]:table==='inventory_lots'?[]:null;
 return Promise.resolve({data,error:null}).then(resolve)}; return q;}};
 const page=compile('app/print/drug-labels/[vn]/page.tsx',name=>{
 if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};
 if(name==='@/lib/supabase/server')return {createClient:async()=>db};
 if(name==='@/lib/auth/guard')return {gatePermission:async()=>{}};
 if(name==='@/lib/drug-label-selection')return parser;
 return {default:()=>null};
 });
 const result=await page.default({params:Promise.resolve({vn:'TEST'}),searchParams:Promise.resolve(items===undefined?{}:{items:JSON.stringify(items)})});
 const labels=[];function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return}if(/^page(?: page-break)?$/.test(node.props?.className))labels.push(node);walk(node.props?.children)}walk(result);
 return {labels,calls,text:JSON.stringify(result)};
}
test('original + checkout-added drug print two labels with current quantities and original directions',async()=>{
 const r=await render([{source:'order',id:'order-1',qty:7},{source:'inventory',id:'drug-2',qty:3}]);
 assert.equal(r.labels.length,2);assert.match(r.text,/Added drug/);assert.match(r.text,/SIG ORIGINAL/);
 assert.match(JSON.stringify(r.labels[0]),/7/);assert.match(JSON.stringify(r.labels[1]),/3/);
 const filters=r.calls.find(c=>c.table==='inventory').filters;
 assert.ok(filters.some(f=>f[0]==='eq'&&f[1]==='clinic_id'&&f[2]==='clinic-1'));
 assert.ok(filters.some(f=>f[0]==='eq'&&f[1]==='category'&&f[2]==='drug'));
});
test('removed original does not print, even with only a newly added drug',async()=>{
 const r=await render([{source:'inventory',id:'drug-2',qty:1}]);assert.equal(r.labels.length,1);assert.doesNotMatch(r.text,/Original drug/);
});
test('empty selection does not fall back to old orders',async()=>assert.equal((await render([])).labels.length,0));
test('unresolvable order or inventory fails closed instead of partial labels',async()=>{
 for(const source of ['order','inventory'])assert.equal((await render([{source,id:'unavailable',qty:1}])).labels.length,0);
});
test('direct print without selection retains saved orders',async()=>assert.equal((await render()).labels.length,1));
test('invalid quantities, sources and excessive lists rejected',()=>{
 for(const row of [{source:'order',id:'x',qty:0},{source:'order',id:'x',qty:-1},{source:'order',id:'x',qty:'2'},{source:'supply',id:'x',qty:1}])assert.throws(()=>parser.parseLabelSelection(JSON.stringify([row])));
 assert.throws(()=>parser.parseLabelSelection('broken'));
 assert.throws(()=>parser.parseLabelSelection(JSON.stringify(Array(101).fill({source:'order',id:'x',qty:1}))));
});
