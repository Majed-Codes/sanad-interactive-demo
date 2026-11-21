// SANAD public demo. Synthetic data and calculations run in this browser.
// Nothing runs without the customer's confirmation.
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

const S = {
  lang: store.get("sanad.interactive.lang") === "en" ? "en" : "ar",
  cid: store.get("sanad.interactive.customer") || "cust_001",
  tab: "home", customers: [], o: null, approvals: [], approval: null, run: null,
  fixedAt: 0, seen: new Set(), phase: null, working: false,
};
const tr = (ar, en) => (S.lang === "ar" ? ar : en);
const t = (l) => (l ? l[S.lang] : "");
const AR_M = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const EN_M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso) => { const [, m, d] = iso.split("-").map(Number); return S.lang === "ar" ? `${d} ${AR_M[m - 1]}` : `${EN_M[m - 1]} ${d}`; };
const money = (h) => (Math.abs(h) % 100 === 0 ? Math.abs(h) / 100 : Math.abs(h) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const num = (h) => `<span class="num">${h < 0 ? "−" : ""}${money(h)}</span>`;
const riyals = (h) => `${money(h)} ${tr("ريال", "riyals")}`;
const firstName = () => (S.o ? t(S.o.customer.name).split(" ")[0] : "");

// ---------- API ----------
const tokens = {};
async function api(path, {method="GET",body}={}) {
  return window.SanadDemo.request(path,{method,body,cid:S.cid});
}

// ---------- identity ----------
function mood() {
  if (Date.now() - S.fixedAt < 12000) return "done";
  return S.approval ? "alert" : "calm";
}
const moodLine = () => ({ calm: tr("يراقب حسابك", "Watching your account"), alert: tr("عندي حل لك", "I have a fix for you"), done: tr("تم", "Done") }[mood()]);
const orb = (size, extra = "", m = null) => `<span class="orb ${m || mood()} ${extra}" ${m ? "data-fixed" : ""} style="--s:${size}px"><i></i><i></i><i></i><i></i><i></i></span>`;
function paintMood() {
  const m = mood();
  document.querySelectorAll(".orb:not([data-fixed])").forEach((e) => { e.classList.remove("calm", "alert", "done"); e.classList.add(m); });
  document.querySelectorAll(".state").forEach((e) => { e.textContent = moodLine(); e.classList.toggle("alert", m === "alert"); });
  const dot = $("#bubble .dot"); if (dot) dot.hidden = !S.approval;
}
function hello() {
  const h = new Date().getHours(), n = firstName() ? " " + firstName() : "";
  if (h < 12) return tr("صباح الخير" + n, "Good morning" + n);
  return tr("مساء الخير" + n, (h < 17 ? "Good afternoon" : "Good evening") + n);
}

// ---------- plain wording (same as the iOS app) ----------
function simple(p) {
  return p.step_views.map((s) => {
    if (s.type === "transfer" && s.source === "checking") return tr(`أحوّل ${riyals(s.amount)} من حسابك لادخارك`, `Move ${riyals(s.amount)} from your account to your savings`);
    if (s.type === "transfer") return tr(`أحوّل لك ${riyals(s.amount)} من ادخارك لحسابك`, `Move ${riyals(s.amount)} from your savings to your account`);
    if (s.type === "defer_obligation") return tr(`نأجّل «${s.obligation.ar}» لين ${day(s.new_date)}`, `Move “${s.obligation.en}” to ${day(s.new_date)}`);
    return tr(`تخفّف مصروفك اليومي ${s.reduction_pct}%`, `You spend ${s.reduction_pct}% less each day`);
  }).join(tr(" و", " and "));
}
function simpleNote(p) {
  const s = p.step_views[0];
  if (!s) return "";
  if (p.step_views.length > 1) return tr("خطوتين مع بعض تغطي النقص.", "Two steps together to cover the gap.");
  if (s.type === "transfer" && s.source === "checking") return tr(`حسابك ينقص ${riyals(s.amount)} وادخارك يزيد، ومجموع فلوسك ما يتغير.`, `Your account goes down by ${riyals(s.amount)} and your savings go up. Your total money stays the same.`);
  if (s.type === "transfer") return tr(`ادخارك ينقص ${riyals(s.amount)}، بس مجموع فلوسك ما يتغير.`, `Your savings go down by ${riyals(s.amount)}. Your total money stays the same.`);
  if (s.type === "defer_obligation") return /savings/i.test(s.obligation.en) ? tr("تحويل ادخارك يتأخر كم يوم بس، وبدون أي رسوم.", "Your savings transfer happens a few days later, at no cost.") : tr("تدفعه بعد الراتب بدل قبله، ونفس المبلغ.", "You pay it after payday instead of before. Same amount.");
  return tr("هذا عليك أنت، البنك ما يقدر يسويه عنك.", "This one is on you; the bank cannot do it for you.");
}
function simpleDone(p) {
  return p.step_views.map((s) => {
    if (s.type === "transfer" && s.source === "checking") return tr(`حوّلنا ${riyals(s.amount)} من حسابك لادخارك`, `${riyals(s.amount)} moved from your account to your savings`);
    if (s.type === "transfer") return tr(`حوّلنا ${riyals(s.amount)} من ادخارك لحسابك`, `${riyals(s.amount)} moved from your savings to your account`);
    if (s.type === "defer_obligation") return tr(`أجّلنا «${s.obligation.ar}» لين ${day(s.new_date)}`, `“${s.obligation.en}” moved to ${day(s.new_date)}`);
    return simple(p);
  }).join(tr(" و", " and "));
}
function eligiblePlans() {
  const r = S.run;
  if (!S.approval || !r || !r.result || !r.result.decision) return [];
  const ok = new Set(r.result.decision.ranking.filter((x) => x.eligible).map((x) => x.key));
  const order = r.result.decision.ranking.map((x) => x.key);
  return (r.result.candidates || []).filter((c) => ok.has(c.key) && c.step_views.length).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

// ---------- loading ----------
async function refresh(notify = true) {
  const [o, approvals] = await Promise.all([api(`/customers/${S.cid}/overview`), api(`/customers/${S.cid}/approvals`)]);
  const pending = approvals.find((a) => a.status === "pending") || null;
  const changed = !S.o || JSON.stringify([o.accounts, o.status, o.forecast.shortfall, o.forecast.min_balance, pending && pending.id]) !== S.sig;
  S.sig = JSON.stringify([o.accounts, o.status, o.forecast.shortfall, o.forecast.min_balance, pending && pending.id]);
  const fresh = pending && !S.seen.has(pending.id);
  S.o = o; S.approvals = approvals; S.approval = pending;
  if (pending && (!S.run || S.run.id !== pending.run_id)) S.run = await api(`/agents/runs/${pending.run_id}`).catch(() => null);
  if (changed && !S.working) renderScreen();
  paintMood();
  if (fresh) {
    S.seen.add(pending.id);
    if (notify && $("#sheet").hidden && $("#hub").hidden) banner();
  }
}
function banner() {
  const b = $("#banner");
  b.innerHTML = `${orb(38, "still")}<div><b>${tr("سَنَد · تنبيه", "SANAD · heads up")}</b><span>${tr("بينقصك مبلغ قبل الراتب. عندي لك حل بسيط.", "You will be short before payday. I have a simple fix.")}</span></div>`;
  b.hidden = false;
  b.onclick = () => { b.hidden = true; openSanad(); };
  setTimeout(() => { b.hidden = true; }, 5000);
}

// ---------- screens ----------
const ICON = {
  home: '<path d="M3 10.6 12 3l9 7.6V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  transfer: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 9.500h8l-2.200-2.200M16 14.500H8l2.200 2.200"/>',
  pay: '<path d="M14 3H7.500a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7.500z"/><path d="M14 3v4.500h4.500M9 13h6M9 17h6"/>',
  store: '<path d="M4 9.500 5.500 4h13L20 9.500"/><path d="M4 9.500a2.700 2.700 0 0 0 5.300 0 2.700 2.700 0 0 0 5.400 0 2.700 2.700 0 0 0 5.300 0M5.500 12.500V20h13v-7.500M10 20v-4.500h4V20"/>',
  more: '<rect x="3.500" y="3.500" width="7" height="7" rx="2.500"/><rect x="13.500" y="3.500" width="7" height="7" rx="2.500"/><rect x="3.500" y="13.500" width="7" height="7" rx="2.500"/><rect x="13.500" y="13.500" width="7" height="7" rx="2.500"/>',
  cash: '<rect x="2.500" y="6" width="19" height="12" rx="2.500"/><circle cx="12" cy="12" r="2.600"/><path d="M6 12h.01M18 12h.01"/>',
  sim: '<rect x="6.500" y="2.500" width="11" height="19" rx="2.800"/><path d="M11 18h2"/>',
  car: '<path d="M5 11.500 6.600 7a2 2 0 0 1 1.900-1.300h7a2 2 0 0 1 1.900 1.300l1.600 4.500"/><rect x="3" y="11.500" width="18" height="6" rx="2"/><path d="M6 17.500v1.500M18 17.500v1.500M7 14.500h.01M17 14.500h.01"/>',
  bell: '<path d="M6 9.500a6 6 0 0 1 12 0c0 5 2 6 2 7.500H4c0-1.500 2-2.500 2-7.500zM10 20a2.100 2.100 0 0 0 4 0"/>',
  gear: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  out: '<path d="M10 4H6.500a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2H10M15 8l4 4-4 4M19 12H9.500"/>',
  card: '<rect x="2.500" y="5.500" width="19" height="13" rx="2.500"/><path d="M2.500 10h19M6 14.500h3"/>',
  eye: '<path d="M2 12s3.600-6.500 10-6.500S22 12 22 12s-3.600 6.500-10 6.500S2 12 2 12z"/><circle cx="12" cy="12" r="2.800"/>',
  hand: '<path d="M8 13V6.500a1.500 1.500 0 0 1 3 0V11V5a1.500 1.500 0 0 1 3 0v6V7a1.500 1.500 0 0 1 3 0v8a6 6 0 0 1-6 6c-3 0-4.500-1.500-6-4l-1.600-3a1.400 1.400 0 0 1 2.400-1.400L8 15"/>',
  chart: '<path d="M4 4v16h16"/><path d="M7.500 15.500 12 10l3 3 5-6.500M20 6.500V10M20 6.500h-3.500"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24">${ICON[k]}</svg>`;

function renderTabs() {
  const tabs = [["home", tr("الرئيسية", "Home")], ["transfer", tr("التحويل", "Transfer")], ["pay", tr("المدفوعات", "Payments")], ["store", tr("المتجر", "Store")], ["more", tr("الخدمات", "Services")]];
  $("#tabs").innerHTML = tabs.map(([k, n]) => `<button class="${S.tab === k ? "on" : ""}" data-tab="${k}"><span>${svg(k)}</span>${esc(n)}</button>`).join("");
  $("#bubble").innerHTML = orb(54) + `<span class="dot" ${S.approval ? "" : "hidden"}></span>`;
}
function renderScreen() {
  const el = $("#screen"), o = S.o;
  if (!o) return;
  // A background refresh must not wipe what the customer is typing in the transfer form.
  const typed = $("#amt") ? { v: $("#amt").value, focus: document.activeElement === $("#amt"), msg: $("#tfmsg").innerHTML } : null;
  setTimeout(() => { const i = $("#amt"); if (typed && i) { i.value = typed.v; $("#tfmsg").innerHTML = typed.msg; if (typed.focus) i.focus(); } }, 0);
  if (S.tab === "home") {
    const acc = o.accounts.find((a) => a.kind === "checking") || o.accounts[0];
    const risk = o.status === "at_risk";
    const f = o.forecast;
    const hint = risk
      ? `<button class="hint" data-act="open">${orb(34, "still")}<span class="txt"><b>${tr(`بينقصك ${riyals(o.forecast.shortfall)} قبل الراتب`, `You will be ${riyals(o.forecast.shortfall)} short before payday`)}</b><span>${S.approval ? tr("سَنَد عنده حل بسيط", "SANAD has a simple fix") : tr("اضغط وشوف السبب", "Tap to see why")}</span></span><span class="go">${S.approval ? tr("حلّها", "Fix it") : tr("التفاصيل", "Details")}</span></button>`
      : `<button class="hint quiet" data-act="open">${orb(26, "still")}<span class="txt"><b>${tr("سَنَد: رصيدك يكفّيك لين الراتب", "SANAD: your balance lasts until payday")}</b></span><span class="left">${num(o.forecast.min_balance)}</span></button>`;
    el.innerHTML = `
      <div class="top"><div class="logo"></div><div class="who"><b>${esc(firstName())}</b><span>${esc(t(o.customer.segment))}</span></div>
        <button class="ico" data-act="settings" aria-label="${tr("الإعدادات", "Settings")}">${svg("gear")}</button>
        <button class="ico" data-act="open" aria-label="${tr("التنبيهات", "Notifications")}">${svg("bell")}${S.approval ? '<span class="dot"></span>' : ""}</button>
        <button class="ico out" data-act="outside" aria-label="${tr("خروج", "Log out")}">${svg("out")}</button></div>
      <div class="balance"><small>${tr("الحساب الاساسي", "Main account")} <span class="num">${esc(acc.iban.slice(-4))} •••</span></small>
        <div class="amt"><em>${tr("ريال", "SAR")}</em><span>${money(acc.balance - (acc.balance % 100))}<sup>.${String(Math.abs(acc.balance) % 100).padStart(2, "0")}</sup></span></div><span class="pill">${tr("جاري", "Current")}</span>
        <div class="pager"><i></i><i class="on"></i></div></div>
      ${hint}
      <div class="tiles">${[["cash", tr("الحوالات السريعة", "Quick transfers")], ["pay", tr("دفع الفواتير", "Pay bills")], ["sim", tr("شحن الجوال", "Mobile top-up")], ["car", tr("المخالفات المرورية", "Traffic fines")]].map(([k, n]) => `<button class="tile" data-act="outside"><i>${svg(k)}</i>${esc(n)}</button>`).join("")}</div>
      <div class="promo"><div><b>${tr("خطوة للأمام!", "One step ahead!")}</b><span>${tr("سَنَد يتوقع رصيدك لثلاثين يومًا وينبّهك قبل لا ينقص.", "SANAD forecasts your balance for thirty days and warns you before it runs short.")}</span></div>${svg("chart")}</div>
      <div class="duo"><div class="card"><small>${tr("متوسط مصروفك اليومي", "Average daily spending")}</small><b>${num(f.spend.daily_mean)} <em>${tr("ريال", "SAR")}</em></b></div>
        <div class="card"><small>${o.next_income ? tr("الراتب يوم", "Salary on") + " " + day(o.next_income.date) : tr("الراتب", "Salary")}</small><b>${o.next_income ? num(o.next_income.amount) : "—"} <em>${tr("ريال", "SAR")}</em></b></div></div>
      <div class="card"><h3>${tr("دفعاتك الجاية", "Coming payments")}</h3>${o.upcoming.filter((e) => e.amount < 0).slice(0, 5).map((e) => `<div class="row"><span>${day(e.date)} · ${esc(t(e.label))}</span><span>${num(-e.amount)}</span></div>`).join("")}</div>`;
  } else if (S.tab === "more") {
    el.innerHTML = `<h1 class="page">${tr("الخدمات", "Services")}</h1><div class="grid3">
      <button class="svc" data-act="hub">${orb(56)}<span>${tr("سَنَد", "SANAD")}</span></button>
      <button class="svc" data-act="outside"><i>${svg("card")}</i><span>${tr("البطاقات", "Cards")}</span></button>
      <button class="svc" data-act="outside"><i>${svg("cash")}</i><span>${tr("التمويل", "Finance")}</span></button>
      <button class="svc" data-act="settings"><i>${svg("gear")}</i><span>${tr("الإعدادات والعرض", "Settings & demo")}</span></button></div>`;
  } else if (S.tab === "transfer") {
    const sav = o.forecast.opening_savings, chk = o.forecast.opening_checking, floor = o.customer.prefs.emergency_reserve;
    el.innerHTML = `<h1 class="page">${tr("التحويل", "Transfer")}</h1>
      <div class="card"><h3>${tr("بين حساباتي", "Between my accounts")}</h3>
        <div class="row"><span>${tr("حسابك", "Your account")}</span><span>${num(chk)}</span></div>
        <div class="row"><span>${tr("ادخارك", "Your savings")}</span><span>${num(sav)}</span></div>
        <div class="row"><span>${tr("حد ادخارك اللي حطيته", "The savings limit you set")}</span><span>${num(floor)}</span></div>
        <div class="seg"><button class="${S.dir !== "checking" ? "on" : ""}" data-dir="savings">${tr("من ادخاري لحسابي", "Savings to account")}</button><button class="${S.dir === "checking" ? "on" : ""}" data-dir="checking">${tr("من حسابي لادخاري", "Account to savings")}</button></div>
        <form id="tf"><input id="amt" inputmode="decimal" autocomplete="off" placeholder="${tr("المبلغ بالريال", "Amount in SAR")}"><button class="btn">${tr("تحقق وكمّل", "Check and continue")}</button></form>
        <div id="tfmsg"></div></div>
      <p class="empty" style="padding:22px 10px">${tr("التحويل لأشخاص أو بنوك ثانية خارج النموذج التجريبي.", "Transfers to other people or banks are outside the prototype.")}</p>`;
    $("#tf").onsubmit = (e) => { e.preventDefault(); requestTransfer($("#amt").value); };
  } else {
    el.innerHTML = `<h1 class="page">${esc({ transfer: tr("التحويل", "Transfer"), pay: tr("المدفوعات", "Payments"), store: tr("المتجر", "Store") }[S.tab])}</h1><p class="empty">${tr("هذي الصفحة خارج النموذج التجريبي.<br>جرّب سَنَد من الرئيسية أو الخدمات.", "This page is outside the prototype.<br>Try SANAD from Home or Services.")}</p>`;
  }
  renderTabs();
}

// ---------- the sheet ----------
function closeSheet() { $("#sheet").hidden = true; $("#scrim").hidden = true; S.phase = null; }
function sheet(html) {
  const sh = $("#sheet");
  const was = sh.hidden;
  sh.innerHTML = html;
  sh.hidden = false; $("#scrim").hidden = false;
  if (!was) { sh.style.animation = "none"; }
  else sh.style.animation = "";
}
/** The whole journey is three steps: the fix, your confirmation, done. */
const steps = (n) => `<div class="steps">${[tr("الحل", "The fix"), tr("تأكيدك", "You confirm"), tr("تم", "Done")].map((s, i) => `<span class="${i + 1 === n ? "on" : i + 1 < n ? "past" : ""}"><b>${i + 1}</b>${s}</span>`).join("<i></i>")}</div>`;
const CHECK = {
  OWN_ACCOUNTS_ONLY: () => tr("بين حساباتك أنت بس", "Between your own accounts only"),
  SUFFICIENT_FUNDS: () => tr("المبلغ موجود", "The money is there"),
  EMERGENCY_RESERVE: () => tr("ادخارك ما ينزل تحت حدّك", "Your savings stay above your limit"),
  TRANSFER_LIMIT: () => tr("ضمن حد التحويل", "Within the transfer limit"),
};
const checks = (p) => { const list = (p.checks || []).filter((c) => c.passed && CHECK[c.code]); return list.length ? `<div class="checks"><small>${tr("تحققت قبل لا أسألك:", "Checked before asking you:")}</small>${list.map((c) => `<span>✓ ${esc(CHECK[c.code]())}</span>`).join("")}</div>` : ""; };
const head = () => `<div class="sh-head">${orb(36)}<div class="n"><b>${tr("سَنَد", "SANAD")}</b><span class="state ${mood() === "alert" ? "alert" : ""}">${moodLine()}</span></div><button class="x" data-act="close" aria-label="${tr("إغلاق", "Close")}">✕</button></div>`;

function openSanad() {
  if (!store.get("sanad.interactive.met")) return intro();
  show("offer");
}
function intro() {
  S.phase = "intro";
  sheet(`<div class="center">${orb(96, "", "calm")}</div><h2 class="center" style="margin:16px 0 0;font-size:26px">${tr("هلا، أنا سَنَد", "Hi, I am SANAD")}</h2><p class="center tag">${tr("سندك قبل لا تحتاج", "Support before you need it")}</p>
    <div style="margin-top:22px"><div class="pt"><i>${svg("eye")}</i>${tr("أتابع حسابك وفواتيرك", "I watch your account and your bills")}</div><div class="pt"><i>${svg("bell")}</i>${tr("أنبّهك قبل لا ينقصك شي", "I warn you before you run short")}</div><div class="pt"><i>${svg("hand")}</i>${tr("ما أسوي أي شي بدون موافقتك", "I do nothing without your OK")}</div></div>
    <div class="moods"><div>${orb(30, "", "calm")}${tr("كل شي تمام", "All good")}</div><div>${orb(30, "", "alert")}${tr("أحتاجك", "I need you")}</div><div>${orb(30, "", "done")}${tr("تم", "Done")}</div></div>
    <button class="btn" data-act="met">${tr("يلا نبدأ", "Let's start")}</button>`);
}

function show(phase, data = {}) {
  S.phase = phase;
  const o = S.o, a = data.approval || S.approval, f = o.forecast;
  if (phase === "offer" && a && a.plan.source === "customer") { phase = S.phase = "confirm"; }
  if (phase === "offer") {
    if (!a && f.shortfall <= 0) {
      return sheet(head() + `<div class="center"><div class="tick">✓</div><h2 style="margin:0">${tr("أمورك طيبة", "All good")}</h2><p class="lead">${tr(`رصيدك يكفّيك لين الراتب. أقل شي يوصل له حسابك ${riyals(f.min_balance)}.`, `Your balance lasts until payday. The lowest it gets is ${riyals(f.min_balance)}.`)}</p></div><button class="btn soft" data-act="hub">${tr("اسأل سَنَد", "Ask SANAD")}</button>`);
    }
    const fix = a ? `<div class="fix"><small>✦ ${tr("الحل", "The fix")}</small><b>${esc(simple(a.plan))}${tr("؟", "?")}</b><span>${esc(simpleNote(a.plan))}</span></div><button class="btn" data-act="yes">${tr("تمام", "OK")}</button>`
      : `<div class="fix"><span>${tr("ما لقيت حل آمن يغطي النقص كله، فما راح أقترح شي الحين.", "I found no safe fix that covers it fully, so I am not suggesting anything for now.")}</span></div>`;
    sheet(head() + steps(1) + `<p class="lead">${data.lead ? esc(data.lead) + " " : ""}${tr("بينقصك قبل الراتب", "You will be short before payday by")}</p><div class="big"><span class="num" id="count">0</span><em>${tr("ريال", "SAR")}</em></div>
      <div class="meter"><b></b><i></i></div><div class="meter-l"><span>${tr("معك", "You have")} ${num(f.opening_checking)}</span><span>${tr("تحتاج", "You need")} ${num(f.opening_checking + f.shortfall)}</span></div>
      ${fix}<div class="chips">${a && eligiblePlans().length > 1 ? `<button class="chip" data-act="options">${tr("خيارات ثانية", "Other options")}</button>` : ""}<button class="chip" data-act="why">${tr("كيف حسبتها؟", "How did you work it out?")}</button><button class="chip" data-act="hub">${tr("اسأل سَنَد", "Ask SANAD")}</button>${a ? `<button class="chip" data-act="no">${tr("مو الحين", "Not now")}</button>` : ""}</div>`);
    countUp($("#count"), f.shortfall / 100, 800);
    requestAnimationFrame(() => requestAnimationFrame(() => { const m = $("#sheet .meter"); if (m) { m.children[0].style.flexGrow = f.opening_checking; m.children[1].style.flexGrow = Math.max(f.shortfall, f.opening_checking * 0.04); } }));
  } else if (phase === "why") {
    const ev = ((o.risks.find((r) => r.actionable) || o.risks[0] || {}).evidence || []);
    const left = ev.reduce((s, e) => s + e.amount, f.opening_checking);
    sheet(head() + `<p class="lead">${tr("هذا اللي معك واللي بيطلع من حسابك قبل الراتب:", "This is what you have and what leaves your account before payday:")}</p><div class="card" style="background:rgba(255,255,255,.05)"><div class="row"><span>${tr("رصيدك اليوم", "Balance today")}</span><span>${num(f.opening_checking)}</span></div>${ev.map((e) => `<div class="row"><span>${esc(S.lang === "ar" ? e.label_ar : e.label_en)}${e.kind === "estimate" ? tr(" (تقدير)", " (estimate)") : ""}</span><span>${num(e.amount)}</span></div>`).join("")}<div class="row"><span style="color:var(--ink);font-weight:600">${tr("الباقي معك قبل الراتب", "What is left before payday")}</span><span style="color:var(--risk);font-weight:700">${num(left)}</span></div></div><button class="btn soft" data-act="back">${tr("رجوع", "Back")}</button>`);
  } else if (phase === "options") {
    const best = S.run.result.decision.selected_key;
    sheet(head() + `<p class="lead">${tr("هذه كل الحلول الآمنة. اختر اللي يناسبك:", "These are all the safe fixes. Pick the one that suits you:")}</p>${eligiblePlans().map((p) => `<button class="opt ${p.key === best ? "best" : ""}" data-pick="${esc(p.key)}">${p.key === best ? `<small>✦ ${tr("اقتراحي", "My suggestion")}</small>` : ""}<b>${esc(simple(p))}</b><span>${esc(simpleNote(p))}</span></button>`).join("")}<button class="btn soft" data-act="back">${tr("رجوع", "Back")}</button>`);
  } else if (phase === "confirm") {
    S.confirming = a;
    sheet(head() + steps(2) + `<p class="lead">${tr("تأكّد قبل لا أسويها:", "Check before I do it:")}</p><div class="fix"><small>✦ ${a.plan.source === "customer" ? tr("طلبك", "Your request") : tr("بسوي التالي", "I will do this")}</small><b>${esc(simple(a.plan))}</b><span>${esc(simpleNote(a.plan))}</span></div>${checks(a.plan)}<button class="btn" data-act="confirm">${tr("أكّد", "Confirm")}</button><button class="btn soft" data-act="${a.plan.source === "customer" ? "no" : "back"}">${a.plan.source === "customer" ? tr("لا، ألغِها", "No, cancel it") : tr("لا، رجوع", "No, go back")}</button><p class="sure">${tr("ما يصير شي إلا بتأكيدك", "Nothing happens without your confirmation")}</p>`);
  } else if (phase === "working") {
    sheet(head() + `<div class="center" style="padding:30px 0">${orb(84, "busy")}<p class="lead" style="margin-top:18px">${tr("لحظة، أنفّذها…", "One moment…")}</p></div>`);
  } else if (phase === "done") {
    const ok = S.o.forecast.shortfall <= 0;
    sheet(head() + steps(3) + `<div class="center"><div class="tick">✓</div><h2 style="margin:0">${tr("تم", "Done")}</h2><p class="lead">${esc(simpleDone(data.approval.plan))}</p>${data.balance != null ? `<p class="lead" style="margin-top:14px">${tr("رصيدك الحين", "Your balance now")}</p><div class="big" style="background:none;-webkit-text-fill-color:var(--good);color:var(--good)"><span class="num" id="count">0</span><em>${tr("ريال", "SAR")}</em></div>` : ""}<p class="lead">${ok ? tr("ويكفّيك لين الراتب.", "It now lasts until payday.") : tr(`باقي ينقصك ${riyals(S.o.forecast.shortfall)} قبل الراتب.`, `You are still ${riyals(S.o.forecast.shortfall)} short before payday.`)}</p></div><button class="btn" data-act="close" style="margin-top:18px">${tr("تمام", "OK")}</button>`);
    if (data.balance != null) countUp($("#count"), data.balance / 100, 900, (data.before ?? 0) / 100);
  } else if (phase === "declined") {
    sheet(head() + `<div class="center"><h2>${tr("تمام، ما تغيّر شي", "OK, nothing changed")}</h2><p class="lead">${esc(data.text || "")}</p></div><button class="btn soft" data-act="close">${tr("إغلاق", "Close")}</button>`);
  } else if (phase === "failed") {
    sheet(head() + `<div class="center"><h2>${tr("ما ضبطت", "It did not go through")}</h2><p class="lead">${tr("ما قدرت أوصل للبنك، وما تغيّر شي. جرّب مرة ثانية بعد شوي.", "The bank could not be reached and nothing changed. Please try again in a moment.")}</p></div><button class="btn soft" data-act="back">${tr("رجوع", "Back")}</button>`);
  } else if (phase === "outside") {
    sheet(head() + `<p class="lead center" style="padding:14px 0 18px">${tr("هذي الخدمة خارج النموذج التجريبي.", "This service is outside the prototype.")}</p><button class="btn soft" data-act="close">${tr("تمام", "OK")}</button>`);
  } else if (phase === "settings") {
    sheet(`<div class="sh-head"><div class="n"><b>${tr("الإعدادات والعرض", "Settings & demo")}</b></div><button class="x" data-act="close">✕</button></div>
      <label class="f" for="cust">${tr("العميل (بيانات افتراضية)", "Customer (synthetic data)")}</label><select id="cust">${S.customers.map((c) => `<option value="${c.id}" ${c.id === S.cid ? "selected" : ""}>${esc(t(c.name))} · ${esc(t(c.segment))}</option>`).join("")}</select>
      <button class="btn soft" data-act="lang">${S.lang === "ar" ? "English" : "العربية"}</button>
      <button class="btn soft" data-act="reset">${tr("أعد العرض من البداية", "Restart the demo")}</button>
      <button class="btn soft" data-act="meet">${tr("اعرض تعريف سَنَد مرة ثانية", "Show SANAD's hello again")}</button>
      <p class="sure">${tr("نموذج تجريبي لتحدي الإنماء، وليس تطبيقًا رسميًا للإنماء. كل البيانات افتراضية وما فيه فلوس حقيقية.", "A concept for the Alinma challenge, not an official Alinma app. All data is synthetic and no real money moves.")}</p>`);
    $("#cust").onchange = async (e) => { S.cid = e.target.value; store.set("sanad.interactive.customer", S.cid); S.o = null; S.run = null; S.fixedAt = 0; closeSheet(); await refresh(false); };
  }
  paintMood();
}

function countUp(el, to, ms, from = 0) {
  if (!el) return;
  if (calm) { el.textContent = to.toLocaleString("en-US"); return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString("en-US");
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function confirmFix() {
  const a = S.confirming;
  if (!a || S.working) return;
  S.working = true;
  show("working");
  const before = (S.o.accounts.find((x) => x.kind === "checking") || {}).balance;
  try {
    const [r] = await Promise.all([api(`/approvals/${a.id}/approve`, { method: "POST" }), sleep(900)]);
    await refresh(false);
    S.working = false;
    if (r.approval.status === "executed") {
      S.fixedAt = Date.now();
      setTimeout(paintMood, 12100);
      const after = r.approval.result && r.approval.result.after ? r.approval.result.after.checking : null;
      show("done", { approval: r.approval, balance: after, before });
    } else show("failed");
  } catch { S.working = false; show("failed"); }
  renderScreen(); paintMood();
}
async function decline() {
  const a = S.approval;
  if (!a) return closeSheet();
  try {
    const r = await api(`/approvals/${a.id}/reject`, { method: "POST" });
    if (r.next_approval) S.seen.add(r.next_approval.id);
    await refresh(false);
    if (a.plan.source === "customer") show("declined", { text: tr("لغيت طلبك.", "I cancelled your request.") });
    else if (S.approval) show("offer", { lead: tr("تمام، عندي حل ثاني.", "OK, I have another fix.") });
    else show("declined", { text: S.o.forecast.shortfall > 0 ? tr(`ما فيه حل آمن ثاني الحين، وباقي ينقصك ${riyals(S.o.forecast.shortfall)} قبل الراتب.`, `There is no other safe fix right now. You are still ${riyals(S.o.forecast.shortfall)} short before payday.`) : "" });
  } catch { show("failed"); }
}
/** The customer asks for a transfer. The server's validation layer decides; this only shows its answer. */
async function requestTransfer(raw) {
  const n = Number(String(raw).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/,/g, "").trim());
  const msg = $("#tfmsg");
  if (!n || n <= 0) { msg.innerHTML = `<p class="warn">${tr("اكتب المبلغ بالأرقام.", "Enter the amount in digits.")}</p>`; return; }
  try {
    const r = await api(`/customers/${S.cid}/transfers/request`, { method: "POST", body: { amount: Math.round(n * 100), source: S.dir === "checking" ? "checking" : "savings" } });
    if (r.status === "ok") { S.seen.add(r.approval.id); await refresh(false); msg.innerHTML = ""; return show("confirm", { approval: r.approval }); }
    msg.innerHTML = `<p class="warn">${esc(t(r.reply))}</p>${r.max_amount > 0 && !r.escalated ? `<button class="btn soft" data-max="${r.max_amount / 100}">${tr("حوّل", "Move")} ${riyals(r.max_amount)}</button>` : ""}`;
  } catch { msg.innerHTML = `<p class="warn">${tr("ما قدرت أوصل للخدمة. جرّب بعد شوي.", "I could not reach the service. Try again in a moment.")}</p>`; }
}
async function pick(key) {
  try {
    let a = S.approval;
    if (!a || a.plan.key !== key) { a = await api(`/customers/${S.cid}/approvals/choose`, { method: "POST", body: { plan_key: key } }); S.seen.add(a.id); await refresh(false); }
    show("confirm", { approval: a });
  } catch { show("failed"); }
}

// ---------- the chat ----------
let busy = false;
function openHub() {
  closeSheet();
  const hub = $("#hub");
  hub.innerHTML = `<div class="hub-head">${orb(34)}<div class="n" style="flex:1"><b>${tr("سَنَد", "SANAD")}</b><span class="state">${moodLine()}</span></div><button class="x" data-act="closehub" aria-label="${tr("إغلاق", "Close")}">✕</button></div>
    <div id="thread"></div><div id="quick"></div><form id="ask"><input id="q" autocomplete="off" placeholder="${tr("اسأل سَنَد…", "Ask SANAD…")}"><button aria-label="${tr("إرسال", "Send")}">↑</button></form>`;
  hub.hidden = false;
  $("#ask").onsubmit = (e) => { e.preventDefault(); ask($("#q").value); };
  paintMood();
  greet();
}
const thread = () => $("#thread");
const toEnd = () => { const th = thread(); if (th) th.scrollTo({ top: th.scrollHeight, behavior: calm ? "auto" : "smooth" }); };
function add(html) { const d = document.createElement("div"); d.innerHTML = html; const n = d.firstElementChild; thread().appendChild(n); toEnd(); return n; }
const me = (text) => add(`<div class="msg me"><div class="b">${esc(text)}</div></div>`);
function quick(list) {
  const q = $("#quick"); if (!q) return;
  q.innerHTML = "";
  list.forEach(([title, fn, primary]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = title; if (primary) b.className = "p"; b.onclick = () => { if (!busy) fn(); }; q.appendChild(b); });
  toEnd();
}
async function stream(box, text) {
  const words = text.split(" ");
  box.innerHTML = words.map((w) => `<span class="w ${calm ? "on" : ""}">${esc(w)}</span>`).join(" ");
  if (calm) return;
  // Reveal by elapsed time, not one timer per word: a browser slows timers in a background tab,
  // and the answer must still finish on time there.
  const gap = Math.min(55, 1500 / words.length), spans = [...box.querySelectorAll(".w")], t0 = performance.now();
  let shown = 0;
  while (shown < spans.length) {
    const upTo = Math.min(spans.length, Math.floor((performance.now() - t0) / gap) + 1);
    for (; shown < upTo; shown++) spans[shown].classList.add("on");
    if (shown < spans.length) await sleep(gap);
  }
}
/** SANAD thinks for a moment (orb stirs, dots rise), then the words arrive one by one. */
async function say(text, wait = 450) {
  const row = add(`<div class="msg">${orb(26, "busy")}<div class="b"><div class="dots"><i></i><i></i><i></i></div></div></div>`);
  await sleep(calm ? 0 : wait);
  $(".orb", row).classList.remove("busy"); $(".orb", row).classList.add("still");
  const b = $(".b", row);
  await stream(b, text);
  toEnd();
  return b;
}
async function facts(box, list) {
  if (!list.length) return;
  const wrap = document.createElement("div"); wrap.className = "facts";
  wrap.innerHTML = list.map((f) => `<div class="fact"><div class="l"><span>${esc(t(f.label))}</span><span class="num v ${/^[−-]/.test(f.value) ? "neg" : ""}">${esc(f.value)}</span></div>${f.note ? `<small>${esc(t(f.note))}</small>` : ""}${f.share != null ? `<div class="bar"><i data-w="${f.share * 100}"></i></div>` : ""}</div>`).join("");
  box.appendChild(wrap); toEnd();
  for (const row of wrap.children) {
    row.classList.add("on");
    const v = $(".v", row), raw = v.textContent, m = raw.match(/^([−-]?)([\d,]+)$/);
    if (m && !calm) { const sign = m[1]; const el = v; const target = Number(m[2].replace(/,/g, "")); el.textContent = sign + "0"; const t0 = performance.now(); const tick = (now) => { const p = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - p, 3); el.textContent = sign + Math.round(target * e).toLocaleString("en-US"); if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
    const bar = $(".bar i", row); if (bar) requestAnimationFrame(() => { bar.style.width = bar.dataset.w + "%"; });
    await sleep(calm ? 0 : 120);
  }
}
function haveNeed() {
  const f = S.o.forecast, need = f.opening_checking + f.shortfall, until = S.o.next_income ? day(S.o.next_income.date) : day(f.min_date);
  const n = add(`<div class="bars"><div class="l"><span>${tr("معك الحين", "You have now")}</span><b>${num(f.opening_checking)}</b></div><div class="t"><b></b></div><div class="l"><span>${tr("تحتاج لين", "You need until")} ${until}</span><b>${num(need)}</b></div><div class="t"><b></b><i></i></div></div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => { const bs = n.querySelectorAll(".t"); bs[0].children[0].style.width = (f.opening_checking / need) * 100 + "%"; bs[1].children[0].style.width = (f.opening_checking / need) * 100 + "%"; bs[1].children[1].style.width = (f.shortfall / need) * 100 + "%"; }));
}
const starters = () => [tr("يكفيني رصيدي لين الراتب؟", "Will my balance last until payday?"), tr("وش فواتيري الجاية؟", "What bills are coming up?"), tr("وين تروح فلوسي؟", "Where does my money go?"), tr("لو صرفت 800 ريال بكرة؟", "What if I spend SAR 800 tomorrow?")].map((q) => [q, () => ask(q)]);
async function greet() {
  busy = true;
  const o = S.o;
  add(`<div class="day">${tr("اليوم", "Today")} · ${day(o.customer.today)}</div>`);
  if (o.status === "at_risk") {
    await say(hello() + tr(`. بينقصك ${riyals(o.forecast.shortfall)} قبل الراتب.`, `. You will be ${riyals(o.forecast.shortfall)} short before payday.`));
    haveNeed();
    if (S.approval) await offer(tr("عندي لك حل بسيط.", "I have a simple fix."));
    else { await say(tr("ما لقيت حل آمن يغطي النقص كله، فما راح أقترح شي الحين.", "I found no safe fix that covers it fully, so I am not suggesting anything for now.")); quick(starters()); }
  } else {
    await say(hello() + tr(". رصيدك يكفّيك لين الراتب، وما تحتاج تسوي شي.", ". Your balance lasts until payday. You do not need to do anything."));
    quick(starters());
  }
  busy = false;
}
async function offer(lead) {
  const p = S.approval.plan;
  await say((lead ? lead + " " : "") + simple(p) + tr("؟", "?") + "\n" + simpleNote(p), 350);
  quick([[tr("تمام", "OK"), () => { me(tr("تمام", "OK")); closeHub(); show("confirm", { approval: S.approval }); }, true],
    [tr("كيف حسبتها؟", "How did you work it out?"), () => ask(tr("يكفيني رصيدي لين الراتب؟", "Will my balance last until payday?"))],
    [tr("وش الحلول الثانية؟", "What are the other options?"), () => ask(tr("وش الحلول الثانية؟", "What are the other options?"))],
    [tr("مو الحين", "Not now"), closeHub]]);
}
async function ask(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true; $("#q").value = ""; quick([]);
  me(text);
  const row = add(`<div class="msg">${orb(26, "busy")}<div class="b"><div class="dots"><i></i><i></i><i></i></div></div></div>`);
  let r = null;
  try { [r] = await Promise.all([api(`/customers/${S.cid}/assistant`, { method: "POST", body: { message: text, lang: S.lang } }), sleep(calm ? 0 : 750)]); } catch {}
  $(".orb", row).classList.remove("busy"); $(".orb", row).classList.add("still");
  const b = $(".b", row);
  if (!r) { await stream(b, tr("ما قدرت أوصل للخدمة. جرّب بعد شوي.", "I could not reach the service. Try again in a moment.")); busy = false; return; }
  await stream(b, t(r.reply));
  await facts(b, r.facts || []);
  if (r.action && r.action.type === "offer") {
    await refresh(false).catch(() => {});
    if (S.approval && r.intent === "transfer") {
      // The customer asked for this transfer and it passed the checks. It still needs their confirmation.
      quick([[tr("أكّد", "Confirm"), () => { me(tr("أكّد", "Confirm")); closeHub(); show("confirm", { approval: S.approval }); }, true], [tr("لا، ألغِها", "No, cancel it"), async () => { me(tr("لا، ألغِها", "No, cancel it")); busy = true; await api(`/approvals/${S.approval.id}/reject`, { method: "POST" }).catch(() => {}); await refresh(false).catch(() => {}); await say(tr("تمام، لغيتها. ما تغيّر شي.", "OK, cancelled. Nothing changed.")); busy = false; quick(starters()); }]]);
    } else if (S.approval) await offer("");
  } else if (r.action && r.action.type === "financing") {
    // SANAD checked the instalment against the budget. Sending it to the bank is the customer's call; the bank decides.
    const fid = r.action.id;
    const finish = async (path, mine) => {
      me(mine); busy = true; quick([]);
      const out = await api(`/financing/${fid}/${path}`, { method: "POST" }).catch(() => null);
      await say(path === "cancel" ? tr("تمام، ما أرسلت شي.", "OK, I sent nothing.") : out ? t(out.reply) : tr("ما قدرت أوصل للخدمة. جرّب بعد شوي.", "I could not reach the service. Try again in a moment."));
      if (out && path === "submit" && out.request.status === "submitted") add(`<div class="handoff">${tr("↗ عند البنك · في النموذج يتسجّل الطلب فقط", "↗ With the bank · in this prototype the request is only recorded")}</div>`);
      busy = false; quick(starters());
    };
    quick([[tr("أكّد وأرسل للبنك", "Confirm and send"), () => finish("submit", tr("أكّد وأرسل للبنك", "Confirm and send")), true], [tr("لا، مو الحين", "No, not now"), () => finish("cancel", tr("لا، مو الحين", "No, not now"))]]);
  } else {
    if (r.action && r.action.type === "escalate") add(`<div class="handoff">${tr("↗ تحوّل لخدمة العملاء · في النموذج يتسجّل في السجل فقط", "↗ Passed to customer service · in this prototype it is only logged")}</div>`);
    quick((r.follow_ups || []).map((l) => [t(l), () => ask(t(l))]));
  }
  busy = false;
}
function closeHub() { $("#hub").hidden = true; busy = false; }

// ---------- events ----------
document.addEventListener("click", async (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) { S.tab = tab.dataset.tab; return renderScreen(); }
  const dir = e.target.closest("[data-dir]");
  if (dir) { S.dir = dir.dataset.dir; return renderScreen(); }
  const mx = e.target.closest("[data-max]");
  if (mx) return requestTransfer(mx.dataset.max);
  const p = e.target.closest("[data-pick]");
  if (p) return pick(p.dataset.pick);
  if (e.target.id === "scrim" && S.phase !== "working") return closeSheet();
  if (e.target.closest("#bubble")) return openSanad();
  const a = e.target.closest("[data-act]");
  if (!a) return;
  const act = a.dataset.act;
  if (act === "open") openSanad();
  else if (act === "close") closeSheet();
  else if (act === "closehub") closeHub();
  else if (act === "met") { store.set("sanad.interactive.met", "1"); show("offer"); }
  else if (act === "meet") intro();
  else if (act === "yes") show("confirm");
  else if (act === "confirm") confirmFix();
  else if (act === "no") decline();
  else if (act === "back") show("offer");
  else if (act === "why") show("why");
  else if (act === "options") show("options");
  else if (act === "hub") openHub();
  else if (act === "outside") show("outside");
  else if (act === "settings") show("settings");
  else if (act === "lang") { S.lang = S.lang === "ar" ? "en" : "ar"; store.set("sanad.interactive.lang", S.lang); applyLang(); renderScreen(); show("settings"); }
  else if (act === "reset") { await api("/demo/shortfall/start", { method: "POST", auth: false }); S.cid = "cust_001"; Object.keys(tokens).forEach((k) => delete tokens[k]); S.seen.clear(); S.run = null; S.fixedAt = 0; closeSheet(); await refresh(false).catch(() => {}); }
});
function applyLang() { document.documentElement.lang = S.lang; document.documentElement.dir = S.lang === "ar" ? "rtl" : "ltr"; }

(async function start() {
  S.cid = "cust_001";
  store.set("sanad.interactive.met", "1");
  applyLang();
  try {
    const setup = await api("/demo/shortfall/start", { method: "POST", auth: false });
    tokens[S.cid] = setup.token;
    S.customers = await api("/customers", { auth: false });
    await refresh(false);
    if (S.approval) S.seen.add(S.approval.id);
    parent.postMessage({type:"sanad-ready"}, location.origin);
  } catch {
    parent.postMessage({type:"sanad-error"}, location.origin);
    $("#screen").innerHTML = `<p class="empty">${tr("ما قدرت أوصل لخدمة سَنَد. شغّل الخادم ثم حدّث الصفحة.", "Cannot reach the SANAD service. Start the server, then reload.")}</p>`;
  }
  setInterval(() => { if (!S.working) refresh(true).catch(() => {}); }, 4000);
})();

window.addEventListener("message", (event) => {
  if (event.source !== parent || event.origin !== location.origin) return;
  if (event.data?.type === "sanad-reset") location.reload();
});
