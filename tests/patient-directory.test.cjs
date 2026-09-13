const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');const vm=require('node:vm');
async function render(params={},fail=false){
 const calls=[];let table;
 const db={auth:{getUser:async()=>({data:{user:null}})},from(t){table=t;const q={};for(const method of ['select','eq','or','gt','lte','order','range'])q[method]=(...args)=>{calls.push([method,...args]);return q};q.then=resolve=>Promise.resolve({data:[],count:127,error:fail?{}:null}).then(resolve);return q}};
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('app/(dashboard)/dashboard/patients/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports:mod.exports,require:n=>n==='react/jsx-runtime'?{jsx:(type,props)=>({props})}:n.includes('supabase/server')?{createClient:async()=>db}:n.includes('auth/guard')?{gatePermission:async()=>{}}:n.includes('auth/permissions')?{getEffectivePermissionsForUser:async()=>({clinicId:'clinic-test'})}:n.includes('utils/date')?{bangkokDate:()=> '2028-02-29'}:{}});
 const result=await mod.exports.default({searchParams:Promise.resolve(params)});return {calls,props:result.props};
}
test('exact count exceeds 100 and page 5 fetches 100..124 with clinic scope',async()=>{const r=await render({page:'5'});assert.equal(r.props.total,127);assert.ok(r.calls.some(c=>c[0]==='range'&&c[1]===100&&c[2]===124));assert.ok(r.calls.some(c=>c[0]==='eq'&&c[1]==='clinic_id'&&c[2]==='clinic-test'));});
test('name tokens and demographic filters applied before pagination; leap-day cutoff valid',async()=>{const r=await render({q:'สมชาย ใจดี',gender:'M',age:'adult'});assert.equal(r.calls.filter(c=>c[0]==='or').length,2);assert.ok(r.calls.some(c=>c[0]==='lte'&&c[2]==='2010-02-28'));assert.ok(r.calls.some(c=>c[0]==='gt'&&c[2]==='1968-02-29'));});
test('invalid page/filter values normalized',async()=>{const r=await render({page:'-4',gender:'x',age:'x'});assert.equal(r.props.page,1);assert.equal(r.props.gender,'all');assert.equal(r.props.age,'all');});
test('load failures are not presented as an empty registry',async()=>assert.equal((await render({},true)).props.loadError,true));
