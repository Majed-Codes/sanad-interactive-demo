/* Public, browser-local demo engine. All amounts are integer halalas and all data is synthetic.
   The UI and seed forecasts come from the original SANAD prototype. No banking connection. */
(function(root){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 const T=(ar,en)=>({ar,en});
 const sar=n=>(n/100).toLocaleString('en-US',{maximumFractionDigits:2});
 const fold=s=>String(s).toLowerCase().replace(/[\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
 const roundEven=n=>{const f=Math.floor(n),d=n-f;return Math.abs(d-.5)<1e-8?(f%2?f+1:f):Math.round(n);};
 const plusDays=(iso,n)=>new Date(Date.parse(iso+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 const numberWords={'واحد':1,'اثنين':2,'ثنتين':2,'ثلاث':3,'ثلاثه':3,'اربع':4,'اربعه':4,'خمس':5,'خمسه':5,'ست':6,'سته':6,'سبع':7,'سبعه':7,'ثمان':8,'ثمانيه':8,'تسع':9,'تسعه':9,'عشر':10,'عشره':10,'عشرين':20,'ثلاثين':30,'اربعين':40,'خمسين':50,'ستين':60,'سبعين':70,'ثمانين':80,'تسعين':90,'ميتين':200,'مئتين':200,'ثلاثميه':300,'اربعميه':400,'خمسميه':500,'ستميه':600,'سبعميه':700,'ثمانميه':800,'تسعميه':900};
 function normalized(text){
  const tokens=fold(text).split(/\s+/),out=[];let current=0,total=0,active=false;
  function flush(){if(active)out.push(String(total+current));current=total=0;active=false;}
  for(let token of tokens){let w=token.replace(/[،,.؟?!]/g,'');if(w.startsWith('و')&&(numberWords[w.slice(1)]||['الف','الاف','الفين','ميه','مائه'].includes(w.slice(1))))w=w.slice(1);
   if(numberWords[w]){current+=numberWords[w];active=true;}
   else if(['ميه','مائه','مئه','مايه'].includes(w)){current=current>0&&current<10?current*100:current+100;active=true;}
   else if(['الف','الاف'].includes(w)){total+=(current||1)*1000;current=0;active=true;}
   else if(w==='الفين'){total+=2000;active=true;}
   else{flush();out.push(token);}
  }flush();return out.join(' ');
 }
 function amountIn(text){const s=normalized(text);for(const m of s.matchAll(/\d[\d,]*(?:\.\d+)?/g)){if(/^\s*(شهر|اشهر|شهور|سنه|سنوات|سنين|months?|years?)/.test(s.slice(m.index+m[0].length)))continue;return Math.round(Number(m[0].replace(/,/g,''))*100);}return null;}
 function monthsIn(text){const s=normalized(text);let m=s.match(/(\d+)\s*(شهر|اشهر|شهور|months?)/);if(m)return Number(m[1]);m=s.match(/(\d+)\s*(سنه|سنوات|سنين|years?)/);if(m)return Number(m[1])*12;if(s.includes('سنتين'))return 24;if(s.includes('شهرين'))return 2;return null;}
 const Q={balance:T('كم رصيدي؟','What is my balance?'),enough:T('يكفيني رصيدي لين الراتب؟','Will my balance last until payday?'),bills:T('وش فواتيري الجاية؟','What bills are coming up?'),spend:T('وين تروح فلوسي؟','Where does my money go?'),whatif:T('لو صرفت 800 ريال بكرة؟','What if I spend SAR 800 tomorrow?'),compare:T('وش الحلول الثانية؟','What are the other options?'),salary:T('متى ينزل راتبي؟','When is my salary due?')};
 const checkCodes=['OWN_ACCOUNTS_ONLY','SUFFICIENT_FUNDS','EMERGENCY_RESERVE','TRANSFER_LIMIT'];
 class DemoBank{
  constructor(seed){this.seed=clone(seed);this.states=new Map();this.serial=0;this.financing=new Map();}
  id(prefix){return prefix+'_'+(++this.serial).toString(36);}
  state(cid){if(!this.seed.scenarios[cid])throw Error('Unknown demo customer');if(!this.states.has(cid))this.reset(cid);return this.states.get(cid);}
  reset(cid='cust_001'){
   const base=clone(this.seed.scenarios[cid]);const f=base.overview.forecast;
   const s={cid,base,checking:f.opening_checking,savings:f.opening_savings,steps:[],excluded:new Set(),replans:0,approvals:[],run:null,log:[]};
   this.states.set(cid,s);this.replan(s);return s;
  }
  forecast(s,extra=[]){
   const base=s.base.overview.forecast,steps=[...s.steps,...extra];let checking=s.checking,savings=s.savings;
   // Previously approved transfers are already included in current balances.
   for(const step of extra)if(step.type==='transfer'){const sign=step.source==='savings'?1:-1;checking+=sign*step.amount;savings-=sign*step.amount;}
   const openingChecking=checking,openingSavings=savings;
   const events=base.days.flatMap(day=>clone(day.events));
   for(const step of steps)if(step.type==='defer_obligation')for(const event of events)if(event.ref_id===step.obligation_id&&event.original_date===step.original_date){event.date=step.new_date;event.moved=true;}
   let known=checking;const days=[];
   for(const original of base.days){
    const day=clone(original);day.events=events.filter(e=>e.date===day.date);
    for(const event of day.events){if(event.kind==='income'&&!event.certain)continue;checking+=event.checking_delta;known+=event.checking_delta;savings+=event.savings_delta;}
    let spend=original.est_spend;
    for(const step of steps)if(step.type==='reduce_spending'&&day.date<=step.until)spend=roundEven(spend*(100-step.reduction_pct)/100);
    checking-=spend;const band=original.checking-original.low;
    Object.assign(day,{checking,checking_known:known,savings,est_spend:spend,low:checking-band,high:checking+band});days.push(day);
   }
   const minimum=days.reduce((a,b)=>b.checking<a.checking?b:a),f=clone(base);
   Object.assign(f,{opening_checking:openingChecking,opening_savings:openingSavings,days,min_balance:minimum.checking,min_date:minimum.date,shortfall:Math.max(0,-minimum.checking),first_negative_date:days.find(d=>d.checking<0)?.date||null,min_known:Math.min(...days.map(d=>d.checking_known)),min_low:Math.min(...days.map(d=>d.low)),end_checking:checking,end_savings:savings,liquidity_end:checking+savings,est_spend_total:days.reduce((n,d)=>n+d.est_spend,0),days_negative:days.filter(d=>d.checking<0).length,days_below_buffer:days.filter(d=>d.checking<s.base.overview.customer.prefs.min_checking_buffer).length});
   f.shortfall_known=Math.max(0,-f.min_known);
   f.horizons=[7,14,30].map(h=>{const ds=days.slice(0,h),m=ds.reduce((a,b)=>b.checking<a.checking?b:a);return {days:h,end_balance:ds.at(-1).checking,min_balance:m.checking,min_date:m.date};});
   return f;
  }
  validate(s,steps){
   let checking=s.checking,savings=s.savings;const floor=s.base.overview.customer.prefs.emergency_reserve,checks=[];
   for(const step of steps){
    if(step.type==='transfer'){
     const own=['checking','savings'].includes(step.source)&&['checking','savings'].includes(step.destination)&&step.source!==step.destination;
     const available=step.source==='savings'?savings:checking;
     const amountOK=Number.isSafeInteger(step.amount)&&step.amount>0;
     checks.push({code:'OWN_ACCOUNTS_ONLY',passed:own,hard:true},{code:'SUFFICIENT_FUNDS',passed:amountOK&&available>=step.amount,hard:true},{code:'TRANSFER_LIMIT',passed:amountOK&&step.amount<=2000000,hard:true});
     const sign=step.source==='savings'?1:-1;checking+=sign*step.amount;savings-=sign*step.amount;
     checks.push({code:'EMERGENCY_RESERVE',passed:savings>=floor,hard:true});
    }
    else if(step.type==='defer_obligation'){
     const event=s.base.overview.forecast.days.flatMap(d=>d.events).find(e=>e.ref_id===step.obligation_id&&e.original_date===step.original_date);
     const days=(Date.parse(step.new_date)-Date.parse(step.original_date))/86400000;
     checks.push({code:'DEFERRAL_ALLOWED',passed:!!event?.deferrable&&days>0&&days<=event.max_defer_days,hard:true});
    }
    else if(step.type==='reduce_spending')checks.push({code:'SPENDING_CUT_LIMIT',passed:step.reduction_pct>0&&step.reduction_pct<=30,hard:true});
    else checks.push({code:'SUPPORTED_ACTION',passed:false,hard:true});
   }
   const fc=this.forecast(s,steps);return {checks,fc,feasible:checks.every(c=>c.passed)};
  }
  plan(s,template){
   const plan=clone(template),v=this.validate(s,plan.steps),f=v.fc,base=this.forecast(s);
   plan.checks=v.checks;plan.feasible=v.feasible;plan.violations=v.checks.filter(c=>!c.passed).map(c=>c.code);
   Object.assign(plan.metrics,{min_checking:f.min_balance,min_date:f.min_date,shortfall:f.shortfall,resolves_shortfall:f.shortfall===0,meets_buffer:f.min_balance>=s.base.overview.customer.prefs.min_checking_buffer,end_checking:f.end_checking,end_savings:f.end_savings,liquidity_end:f.liquidity_end,savings_delta:f.end_savings-base.end_savings,est_spend_total:f.est_spend_total,days_negative:f.days_negative,days_below_buffer:f.days_below_buffer});
   return plan;
  }
  candidates(s){
   const baseline=this.forecast(s),buffer=s.base.overview.customer.prefs.min_checking_buffer;
   return s.base.run.result.candidates.filter(p=>baseline.shortfall>0||p.key==='no_action').map(original=>{
    const template=clone(original);
    if(['transfer_from_savings','transfer_plus_reduce'].includes(template.key)&&baseline.shortfall>0){
     const remaining=this.forecast(s,template.steps.filter(step=>step.type!=='transfer')).shortfall;
     const amount=Math.ceil((remaining+buffer)/10000)*10000;
     for(const step of [...template.steps,...template.step_views])if(step.type==='transfer')step.amount=amount;
     if(template.key==='transfer_from_savings')template.title=T(`تحويل ${sar(amount)} ر.س من الادخار إلى الجاري`,`Transfer SAR ${sar(amount)} from savings to checking`);
    }
    return this.plan(s,template);
   });
  }
  replan(s){
   const f=this.forecast(s),candidates=this.candidates(s),ranking=clone(s.base.run.result.decision.ranking);
   for(const entry of ranking){const p=candidates.find(p=>p.key===entry.key);entry.eligible=!!p&&p.feasible&&p.steps.length>0&&p.metrics.resolves_shortfall&&!s.excluded.has(p.key)&&f.shortfall>0;}
   const selected=ranking.find(r=>r.eligible)?.key||null;
   s.run=clone(s.base.run);s.run.id=this.id('run');s.run.customer_id=s.cid;
   s.run.result={...s.run.result,candidates,decision:{...s.run.result.decision,ranking,selected_key:selected}};
   s.run.status=selected?'awaiting_approval':f.shortfall?'no_safe_plan':'no_action';
   if(selected)this.createApproval(s,candidates.find(p=>p.key===selected));
  }
  createApproval(s,plan){
   for(const a of s.approvals)if(a.status==='pending')a.status='superseded';
   const a={id:this.id('apr'),customer_id:s.cid,run_id:s.run.id,status:'pending',plan:clone(plan),created_at:new Date().toISOString(),expires_at:new Date(Date.now()+1800000).toISOString(),result:null};
   s.approvals.unshift(a);return a;
  }
  overview(s){
   const o=clone(s.base.overview),f=this.forecast(s);o.forecast=f;o.total_position=s.checking+s.savings;
   for(const account of o.accounts)account.balance=account.kind==='checking'?s.checking:s.savings;
   o.status=f.shortfall?'at_risk':f.min_balance<o.customer.prefs.min_checking_buffer?'watch':'healthy';
   const events=f.days.flatMap(d=>d.events);o.upcoming=events.map(e=>({date:e.date,original_date:e.original_date,ref_id:e.ref_id,kind:e.kind,label:T(e.label_ar,e.label_en),amount:e.checking_delta,certain:e.certain,deferrable:e.deferrable,max_defer_days:e.max_defer_days,moved:e.moved})).sort((a,b)=>a.date.localeCompare(b.date));
   o.next_income=o.upcoming.find(e=>e.kind==='income'&&e.certain)||null;
   o.pending_approval_id=s.approvals.find(a=>a.status==='pending')?.id||null;o.latest_run=clone(s.run);
   o.risks=[];
   if(f.shortfall){const ds=f.days.filter(d=>d.date<=f.min_date),evidence=ds.flatMap(d=>d.events).filter(e=>e.checking_delta<0).map(e=>({date:e.date,label_ar:e.label_ar,label_en:e.label_en,amount:e.checking_delta,kind:e.kind}));evidence.push({date:f.min_date,label_ar:'مصروف يومي متوقع',label_en:'Estimated everyday spending',amount:-ds.reduce((n,d)=>n+d.est_spend,0),kind:'estimate'});o.risks.push({code:'CASH_SHORTFALL',actionable:true,amount:f.shortfall,date:f.first_negative_date,evidence});}
   o.activity=s.log.map((entry,i)=>({run_id:entry.approval_id,ts:entry.at,agent:'execution',state:'LEARN',kind:'conclusion',title:entry.title})).slice(-8);
   return o;
  }
  findApproval(id){for(const s of this.states.values()){const a=s.approvals.find(a=>a.id===id);if(a)return {s,a};}throw Error('Approval not found');}
  approve(id){
   const {s,a}=this.findApproval(id);if(a.status==='executed')return {approval:clone(a)};
   if(a.status!=='pending')throw Error('Approval is closed');
   if(Date.now()>Date.parse(a.expires_at)){a.status='expired';return {approval:clone(a)};}
   const v=this.validate(s,a.plan.steps);
   const customerTransfer=a.plan.source==='customer'&&a.plan.steps.some(step=>step.type==='transfer'&&step.source==='checking');
   if(!v.feasible||(customerTransfer&&v.fc.shortfall>0)){a.status='failed';return {approval:clone(a)};}
   const before={checking:s.checking,savings:s.savings};
   for(const step of a.plan.steps){
    if(step.type==='transfer'){const sign=step.source==='savings'?1:-1;s.checking+=sign*step.amount;s.savings-=sign*step.amount;}
    else s.steps.push(clone(step));
   }
   a.status='executed';a.result={before,after:{checking:s.checking,savings:s.savings}};
   s.log.push({at:new Date().toISOString(),approval_id:a.id,title:T('نُفّذ الإجراء بموافقتك','Action completed with your approval')});
   s.excluded.clear();s.replans=0;this.replan(s);return {approval:clone(a)};
  }
  reject(id){const {s,a}=this.findApproval(id);if(a.status!=='pending')throw Error('Approval is closed');a.status='rejected';s.excluded.add(a.plan.key);s.replans++;if(a.plan.source!=='customer'&&s.replans<=2)this.replan(s);return {approval:clone(a),next_approval:clone(s.approvals.find(a=>a.status==='pending')||null)};}
  transfer(s,source,amount){
   if(!['savings','checking'].includes(source))throw Error('Invalid source');
   const floor=s.base.overview.customer.prefs.emergency_reserve,f=this.forecast(s),available=source==='savings'?s.savings:s.checking;
   const max=source==='savings'?Math.max(0,s.savings-floor):Math.max(0,f.min_balance);
   const deny=(status,ar,en)=>({status,reply:T(ar,en),max_amount:max,approval_id:null});
   if(!Number.isSafeInteger(amount)||amount<=0)return deny('bad_amount','اكتب مبلغًا صحيحًا.','Enter a valid amount.');
   if(amount>2000000)return deny('over_limit','المبلغ فوق حد التحويل (20,000 ريال).','That is above the SAR 20,000 transfer limit.');
   if(amount>available)return deny('over_funds',`الرصيد المتاح ${sar(available)} ريال.`,`The available balance is SAR ${sar(available)}.`);
   if(source==='savings'&&amount>max)return deny('over_reserve',`هذا ينزّل ادخارك تحت حدّك (${sar(floor)} ريال). أقصى مبلغ ${sar(max)} ريال.`,`This goes below your SAR ${sar(floor)} savings floor. The maximum is SAR ${sar(max)}.`);
   if(source==='checking'&&amount>max)return deny('would_short',`لو حوّلتها، بينقصك ${sar(Math.max(0,amount-f.min_balance))} ريال. أقصى مبلغ آمن ${sar(max)} ريال.`,`This would leave a SAR ${sar(Math.max(0,amount-f.min_balance))} shortfall. The safe maximum is SAR ${sar(max)}.`);
   const template={key:this.id('customer_transfer'),source:'customer',title:T('تحويل بين حساباتك','Transfer between your accounts'),steps:[{type:'transfer',source,destination:source==='savings'?'checking':'savings',amount}],step_views:[{type:'transfer',source,destination:source==='savings'?'checking':'savings',amount}],metrics:{}};
   const p=this.plan(s,template),a=this.createApproval(s,p);
   return {status:'ok',reply:T(`جهّزت تحويل ${sar(amount)} ريال. ما يتنفّذ قبل تأكيدك.`,`Prepared a SAR ${sar(amount)} transfer. It needs your confirmation.`),max_amount:amount,approval_id:a.id,approval:clone(a)};
  }
  assistant(s,message){
   const text=normalized(message),f=this.forecast(s),o=this.overview(s),pending=s.approvals.find(a=>a.status==='pending');
   const fact=(ar,en,value,note=null)=>({label:T(ar,en),value:String(value),note});
   const response=(intent,reply,facts=[],action=null,follow=[Q.enough,Q.bills,Q.spend])=>({mode:'deterministic',intent,reply,facts,action,follow_ups:follow});
   const n=amountIn(message);
   if(/(ابي|ابغي|ابغا|احتاج|اريد|اطلب).*?(تمويل|قرض)|اقترض|\bloan\b|borrow|want.*financ/.test(text))return this.prepareFinancing(s,n,monthsIn(message));
   if(/حول|انقل|اسحب|ادخر|transfer|withdraw|send|move/.test(text)&&/(ايبان|iban|مستفيد|بنك ثاني|صديق|اخوي|اختي|امي|ابوي|زوج|friend|someone|another bank)/.test(text))return response('escalate',T('التحويل لشخص ثاني خارج النموذج التجريبي. ما تحرّك من فلوسك شي.','Transfers to other people are outside this prototype. None of your money moved.'),[],{type:'escalate'});
   if(/حول|انقل|اسحب|ادخر|transfer|withdraw|move/.test(text)&&n!==null&&/ادخار|حسابي|الجاري|savings|my account|checking/.test(text)){
    const toSavings=/(لادخاري|للادخار|الي الادخار|في ادخاري|ادخر|to (my )?savings)/.test(text)&&!/(من ادخار|from (my )?savings)/.test(text);
    const result=this.transfer(s,toSavings?'checking':'savings',n);return response(result.status==='ok'?'transfer':'transfer_blocked',result.reply,[],result.status==='ok'?{type:'offer'}:null);
   }
   if(/نفذ|حولها|حول الان|وافق|اعتمد|سوها|سويها|approve|execute|transfer now|do it/.test(text))return response('execute',pending?T('جهّزت لك الحل، بس لازم تراجعه وتؤكّده من زر التأكيد.','The fix is ready. Review it and use the confirmation button.'):T('ما فيه إجراء بانتظار تأكيدك.','No action is waiting for confirmation.'),[],pending?{type:'offer'}:null);
   if(/ماذا لو|وش لو|لو صرفت|لو دفعت|لو شريت|لو اشتريت|اقدر اشتري|what if|can i (afford|buy|spend)/.test(text)){
    if(n===null)return response('whatif',T('كم المبلغ اللي تفكّر تصرفه؟','How much are you thinking of spending?'));
    const after=f.min_balance-n;
    return response('whatif',T(after<0?`لو صرفت ${sar(n)} ريال بكرة، بينقصك ${sar(-after)} ريال حسب التوقع. ما تغيّر شي في حسابك.`:`لو صرفت ${sar(n)} ريال بكرة، أقل رصيد متوقع ${sar(after)} ريال. هذا حساب افتراضي، وما تغيّر شي.`,after<0?`Spending SAR ${sar(n)} tomorrow would leave a projected SAR ${sar(-after)} shortfall. Your account has not changed.`:`Spending SAR ${sar(n)} tomorrow leaves a projected minimum of SAR ${sar(after)}. Nothing has changed.`),[fact('أقل رصيد الحين','Lowest balance now',sar(f.min_balance)),fact('بعد المصروف','After spending',sar(after))]);
   }
   if(/كيف حسبت|ليش|ليه|لماذا|سبب|why|reason/.test(text))return response('why',T(`حسبت رصيدك ${sar(s.checking)} ريال، وخصمت الدفعات والمصروف اليومي المتوقع لين أدنى رصيد. ${f.shortfall?`النقص ${sar(f.shortfall)} ريال.`:'رصيدك يكفي.'}`,`I used your SAR ${sar(s.checking)} balance and subtracted scheduled payments and estimated daily spending. ${f.shortfall?`The shortfall is SAR ${sar(f.shortfall)}.`:'Your balance lasts.'}`),(o.risks[0]?.evidence||[]).map(e=>fact(e.label_ar,e.label_en,sar(e.amount))));
   if(/قارن|مقارنه|بدائل|خيارات|حلول|compare|alternativ|option/.test(text)){
    const plans=this.candidates(s).filter(p=>p.steps.length);
    return response('compare',T('هذي الخيارات اللي حسبتها. الرقم هو أدنى رصيد متوقع مع كل خيار.','These are the options I calculated. Each number is the projected minimum balance.'),plans.map(p=>fact(p.title.ar,p.title.en,sar(p.metrics.min_checking),T(p.feasible&&p.metrics.resolves_shortfall?'يغطي النقص':'ما يغطي النقص بأمان',p.feasible&&p.metrics.resolves_shortfall?'Covers the shortfall':'Does not safely cover the gap'))),null,[Q.enough,Q.bills]);
   }
   if(/متي.*راتب|راتب.*متي|كم راتبي|when.*(payday|salary|paid)|my salary/.test(text))return response('salary',o.next_income?T(`راتبك ${sar(o.next_income.amount)} ريال، موعده ${o.next_income.date}.`,`Your SAR ${sar(o.next_income.amount)} salary is due ${o.next_income.date}.`):T('ما فيه دخل منتظم مسجّل ضمن الفترة.','No regular income is scheduled in this period.'));
   if(/التزام|فواتير|فاتوره|اقساط|قسط|مستحق|bills?|obligation|due|payments?/.test(text))return response('obligations',T('هذي دفعاتك الجاية حسب الجدول المسجّل.','These are your upcoming scheduled payments.'),o.upcoming.filter(e=>e.amount<0).slice(0,8).map(e=>fact(e.label.ar,e.label.en,sar(-e.amount),T(e.date,e.date))));
   if(/صرف|مصروف|انفاق|وين تروح|وين راحت|spend|categor|money go|where.*money/.test(text))return response('spending',T(`متوسط مصروفك اليومي ${sar(f.spend.daily_mean)} ريال، حسب سجل العمليات الافتراضي.`,`Your average daily spending is SAR ${sar(f.spend.daily_mean)}, from the synthetic transaction history.`),o.spending.by_category.map(c=>fact(c.label.ar,c.label.en,sar(c.amount))));
   if(/هدف|ادخار|مدخر|توفير|goal|saving/.test(text))return response('goal',T(`في ادخارك ${sar(s.savings)} ريال. حدّك اللي حطّيته ${sar(o.customer.prefs.emergency_reserve)} ريال.`,`Your savings hold SAR ${sar(s.savings)}. Your savings floor is SAR ${sar(o.customer.prefs.emergency_reserve)}.`),o.goals.map(g=>fact(g.name.ar,g.name.en,`${Math.min(100,Math.round(100*s.savings/g.target))}%`)));
   if(/سجل|تدقيق|وش سويت|ماذا نفذت|audit|log|what did you do/.test(text))return response('audit',s.log.length?T(`تم تنفيذ ${s.log.length} إجراء بموافقتك في هذي التجربة.` ,`${s.log.length} action(s) completed with your approval in this session.`):T('ما نفّذت أي إجراء في هذي التجربة للحين.','No action has been executed in this session.'));
   if(/توقع|مستقبل|عجز|يكفي|بيكفي|ينقصني|بينقصني|الراتب|forecast|predict|shortfall|enough|last until/.test(text))return response('forecast',f.shortfall?T(`بينقصك ${sar(f.shortfall)} ريال قبل الراتب. ${pending?'عندي لك حل تراجعه وتؤكّده.':'ما لقيت حل آمن يغطي النقص كله.'}`,`You will be SAR ${sar(f.shortfall)} short before payday. ${pending?'I have a fix for you to review and confirm.':'I found no safe fix that covers it fully.'}`):T(`رصيدك يكفي لين الراتب. أدنى رصيد متوقع ${sar(f.min_balance)} ريال.`,`Your balance lasts until payday. The projected minimum is SAR ${sar(f.min_balance)}.`),[fact('رصيدك اليوم','Balance today',sar(s.checking)),fact('أقل رصيد متوقع','Projected minimum',sar(f.min_balance))]);
   if(/رصيد|كم معي|كم عندي|كم باقي|وضعي|حسابي|فلوسي|balance|position|how much/.test(text))return response('balance',T(`معك ${sar(s.checking)} ريال في حسابك، و${sar(s.savings)} ريال في ادخارك.`,`You have SAR ${sar(s.checking)} in your account and SAR ${sar(s.savings)} in savings.`),[fact('حسابك','Your account',sar(s.checking)),fact('ادخارك','Your savings',sar(s.savings))]);
   if(/شكرا|مشكور|يعطيك العافيه|تسلم|thanks|thank you/.test(text))return response('thanks',T('العفو، أنا معك.','You are welcome. I am here for you.'),[],null,[]);
   return response('help',T('أنا سَنَد، مساعدك المالي. أقدر أشرح رصيدك وفواتيرك ومصروفك، وأحسب لك «لو صرفت…». أي تحويل يحتاج تأكيدك.','I am SANAD, your money helper. Ask about balances, bills, spending or what-if spending. Every transfer needs your confirmation.'));
  }
  financingBudget(s){
   const o=this.overview(s),income=o.next_income?.amount||0,fixed=o.upcoming.filter(e=>e.amount<0).reduce((n,e)=>n-e.amount,0),spend=o.forecast.spend.daily_mean*30;
   return Math.max(0,income-fixed-spend-o.customer.prefs.min_checking_buffer);
  }
  prepareFinancing(s,amount,months){
   const result=(intent,reply,facts=[],action=null)=>({mode:'deterministic',intent,reply,facts,action,follow_ups:[]});
   if(!amount||!months||months<3||months>60)return result('financing_ask',T('اذكر المبلغ والمدة من 3 إلى 60 شهر. مثال: أبي تمويل 6000 على 24 شهر.','Give an amount and a term from 3 to 60 months, for example: financing of 6000 over 24 months.'));
   const safe=this.financingBudget(s),instalment=Math.ceil(amount/(months*100))*100;
   const facts=[{label:T('القسط قبل ربح البنك','Instalment before bank profit'),value:sar(instalment)},{label:T('أقصى قسط حسب ميزانيتك','Budget-based maximum'),value:sar(safe)}];
   if(instalment>safe)return result('financing_blocked',T(`القسط ${sar(instalment)} ريال، أكثر من حد ميزانيتك ${sar(safe)} ريال. ما أرسلت طلب.`,`The SAR ${sar(instalment)} instalment exceeds your SAR ${sar(safe)} budget limit. No request was submitted.`),facts);
   for(const f of this.financing.values())if(f.customer_id===s.cid&&f.status==='draft')f.status='cancelled';
   const id=this.id('fin');this.financing.set(id,{id,customer_id:s.cid,amount,months,instalment,status:'draft'});
   return result('financing',T(`القسط ${sar(instalment)} ريال قبل ربح البنك. تقدر تؤكّد تسجيل الطلب التجريبي؛ القرار عند البنك، وما فيه صرف فلوس.`,`The instalment is SAR ${sar(instalment)} before bank profit. Confirm to record the demo request. The bank decides; no money is paid out.`),facts,{type:'financing',id});
  }
  request(path,{method='GET',body,cid='cust_001'}={}){
   if(path==='/customers')return clone(this.seed.customers);
   if(path==='/session')return {token:'browser-demo',customer_id:body.customer_id};
   if(path==='/demo/shortfall/start'){this.reset('cust_001');return {token:'browser-demo'};}
   let m=path.match(/^\/customers\/([^/]+)\/(.+)$/);
   if(m){const s=this.state(m[1]),route=m[2];
    if(route==='overview')return this.overview(s);
    if(route==='approvals')return clone(s.approvals);
    if(route==='assistant')return this.assistant(s,body.message);
    if(route==='transfers/request')return this.transfer(s,body.source,body.amount);
    if(route==='approvals/choose'){
     const p=s.run.result.candidates.find(p=>p.key===body.plan_key),rank=s.run.result.decision.ranking.find(r=>r.key===body.plan_key);
     if(!p||!rank?.eligible||!this.validate(s,p.steps).feasible)throw Error('Plan is not eligible');
     return clone(this.createApproval(s,p));
    }
   }
   m=path.match(/^\/agents\/runs\/(.+)$/);if(m){for(const s of this.states.values())if(s.run.id===m[1]||s.approvals.some(a=>a.run_id===m[1]))return clone(s.run);throw Error('Run not found');}
   m=path.match(/^\/approvals\/([^/]+)\/(approve|reject)$/);if(m){const {s}=this.findApproval(m[1]);if(s.cid!==cid)throw Error('Customer mismatch');return m[2]==='approve'?this.approve(m[1]):this.reject(m[1]);}
   m=path.match(/^\/financing\/([^/]+)\/(submit|cancel)$/);if(m){const f=this.financing.get(m[1]);if(!f||f.customer_id!==cid)throw Error('Financing request not found');if(f.status==='draft'){if(m[2]==='submit'&&f.instalment>this.financingBudget(this.state(cid))){f.status='cancelled';return {request:clone(f),reply:T('ميزانيتك تغيّرت والقسط ما عاد يناسبها. ما سجّلت الطلب.','Your budget changed and the instalment no longer fits. The request was not submitted.')};}f.status=m[2]==='submit'?'submitted':'cancelled';}return {request:clone(f),reply:T(f.status==='submitted'?'تم تسجيل الطلب التجريبي. ما تحرّك أي مبلغ.':'تم إلغاء الطلب.',f.status==='submitted'?'The demo request was recorded. No money moved.':'The request was cancelled.')};}
   throw Error('Unsupported demo route: '+path);
  }
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={DemoBank,fold,normalized,amountIn};
 else{
  root.SanadDemo={ready:fetch('demo-seed.json').then(r=>{if(!r.ok)throw Error('Demo data unavailable');return r.json();}).then(seed=>new DemoBank(seed)),async request(path,options){const bank=await this.ready;return clone(bank.request(path,options));}};
 }
})(typeof window!=='undefined'?window:globalThis);
