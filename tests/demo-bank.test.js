const test=require('node:test');
const assert=require('node:assert/strict');
const {DemoBank,amountIn}=require('../phone/demo-bank.js');
const seed=require('../phone/demo-seed.json');
const expected=require('./python-expected.json');
const bank=()=>new DemoBank(seed);
for(const cid of Object.keys(expected)){
 test(`30-day forecast and all candidate results match Python: ${cid}`,()=>{
  const b=bank(),s=b.state(cid),f=b.forecast(s),e=expected[cid];
  assert.equal(f.min_balance,e.min);
  assert.deepEqual(f.days.map(d=>['checking','checking_known','savings','low','high'].map(k=>d[k])),e.days);
  for(const p of b.candidates(s)){const result=e.candidates[p.key];assert.equal(p.feasible,result.feasible);for(const k of ['min_checking','end_checking','end_savings','shortfall','est_spend_total'])assert.equal(p.metrics[k],result[k],p.key+':'+k);}
 });
}
test('recommended transfer requires confirmation, conserves total money, and is idempotent',()=>{
 const b=bank(),s=b.state('cust_001'),a=s.approvals[0];
 assert.equal(s.checking,420000);assert.equal(s.savings,1200000);assert.equal(a.status,'pending');
 b.approve(a.id);assert.equal(s.checking,470000);assert.equal(s.savings,1150000);assert.equal(s.checking+s.savings,1620000);assert.equal(b.forecast(s).min_balance,15000);
 b.approve(a.id);assert.equal(s.checking,470000);assert.equal(s.savings,1150000);
});
test('declining changes no balances and offers the safe deferral',()=>{
 const b=bank(),s=b.state('cust_001'),first=s.approvals[0];
 const next=b.reject(first.id).next_approval;assert.equal(s.checking,420000);assert.equal(s.savings,1200000);assert.match(next.plan.key,/defer/);
 b.approve(next.id);assert.equal(s.checking,420000);assert.equal(s.savings,1200000);assert.equal(b.forecast(s).min_balance,45000);
});
test('savings floor, available funds, transfer ceiling, and forecast protect manual requests',()=>{
 const b=bank(),s=b.state('cust_001');
 assert.equal(b.transfer(s,'savings',300001).status,'over_reserve');
 assert.equal(b.transfer(s,'savings',1500000).status,'over_funds');
 assert.equal(b.transfer(s,'savings',2000001).status,'over_limit');
 assert.equal(b.transfer(s,'checking',10000).status,'would_short');
 assert.equal(s.checking,420000);assert.equal(s.savings,1200000);
 const r=b.transfer(s,'savings',100000);assert.equal(r.status,'ok');assert.equal(s.checking,420000);
 b.approve(r.approval_id);assert.equal(s.checking,520000);assert.equal(s.savings,1100000);
});
test('confirmation checks the current funds and refuses expired or cross-customer approvals',()=>{
 const b=bank(),s=b.state('cust_001'),a=s.approvals[0];s.savings=900000;
 assert.equal(b.approve(a.id).approval.status,'failed');assert.equal(s.checking,420000);
 const c=bank(),t=c.state('cust_001'),p=t.approvals[0];p.expires_at='2000-01-01T00:00:00Z';
 assert.equal(c.approve(p.id).approval.status,'expired');assert.equal(t.checking,420000);
 const d=bank(),x=d.state('cust_001');assert.throws(()=>d.request(`/approvals/${x.approvals[0].id}/approve`,{cid:'cust_004'}));
});
test('separate visitors and resets never share mutated balances',()=>{
 const a=bank(),b=bank(),s=a.state('cust_001');a.approve(s.approvals[0].id);
 assert.equal(b.state('cust_001').checking,420000);a.reset();assert.equal(a.state('cust_001').checking,420000);
});
test('what-if and typed execution do not move money; a typed transfer still needs confirmation',()=>{
 const b=bank(),s=b.state('cust_001');
 const whatif=b.assistant(s,'لو صرفت 800 ريال بكرة؟');assert.equal(whatif.intent,'whatif');assert.match(whatif.reply.en,/1,150/);
 const execute=b.assistant(s,'حوّلها');assert.equal(execute.action.type,'offer');assert.equal(s.checking,420000);
 const ask=b.assistant(s,'حوّل لي ألف من ادخاري لحسابي');assert.equal(ask.intent,'transfer');assert.equal(s.checking,420000);
 b.approve(s.approvals.find(a=>a.status==='pending').id);assert.equal(s.checking,520000);
});
test('spoken and Arabic-digit amounts normalize correctly',()=>{
 assert.equal(amountIn('حوّل ألف وخمسمية من ادخاري'),150000);assert.equal(amountIn('حوّل ٥٠٠ ريال'),50000);assert.equal(amountIn('ابي تمويل 6000 على 24 شهر'),600000);
});
test('financing only records a draft or submission, with no disbursement',()=>{
 const b=bank(),s=b.state('cust_001');const r=b.assistant(s,'أبي تمويل 6000 على 24 شهر');assert.equal(r.action.type,'financing');
 const submit=b.request(`/financing/${r.action.id}/submit`,{cid:s.cid});assert.equal(submit.request.status,'submitted');assert.equal(s.checking,420000);assert.equal(s.savings,1200000);
});
