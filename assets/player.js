(function () {
  'use strict';
  const data = window.SANAD_TIMING;
  const $ = id => document.getElementById(id);
  const audio = $('narration');
  const cap = $('cap');
  const seekBar = $('seek');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sceneTitles = ['هلا، أنا سَنَد', 'نورة', 'التنبيه', 'الحل', 'كيف حسبتها؟', 'الخيارات', 'القرار لها', 'تم', 'كل خطوة محسوبة', 'سَنَد'];
  const phaseIds = ['pOffer', 'pWhy', 'pOpts', 'pConfirm', 'pWorking', 'pDone'];
  let interactive = false, liveFrame = null, loadTimer = null, dragResume = null, phoneReady = false;
  let currentScene = -1, lastRendered = -1, fitted = {k:''}, fitQueued = false;
  let total = data.duration, playbackError = '', playAttempt = 0;
  const A = data.actions;
  const clamp = value => Math.max(0, Math.min(1, value));
  const progress = (s, start, duration) => clamp((s - start) / duration);
  const ease = x => x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x+2, 3)/2;
  const animated = (s, start, duration) => reduce ? (s >= start ? 1 : 0) : ease(progress(s, start, duration));
  const money = n => Math.round(n).toLocaleString('en-US');
  const timeText = s => Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2,'0');

  function fit() {
    fitQueued = false;
    const box = $('phoneBox');
    // CSS owns the columns. Fit inside the allocated slot without changing its width.
    const k = Math.max(.1, Math.min(box.clientHeight/864, box.clientWidth/410, 1.05)).toFixed(4);
    if (k !== fitted.k) {$('phone').style.transform = 'translate(-50%, -50%) scale('+k+')'; fitted.k = k;}
  }
  function fitSoon() {if (!fitQueued) {fitQueued = true; requestAnimationFrame(fit);}}
  addEventListener('resize', fitSoon);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(fitSoon);
    observer.observe(document.querySelector('main')); observer.observe(document.querySelector('.narr'));
  }

  function renderCaptions(s) {
    let index = 0;
    for (let i=1;i<data.scenes.length;i++) {if (data.scenes[i].start <= s) index=i; else break;}
    const scene = data.scenes[index];
    if (index !== currentScene) {
      currentScene = index;
      cap.replaceChildren();
      for (const word of scene.words) {
        const span = document.createElement('span'); span.className='w'; span.textContent=word.text;
        cap.append(span, document.createTextNode(' '));
      }
      $('chapN').textContent=String(index+1); $('chapT').textContent=sceneTitles[index];
      fitSoon();
    }
    const spans=cap.querySelectorAll('.w');
    scene.words.forEach((word,i) => {
      const state = s >= word.end ? 'w on' : s >= word.start ? 'w now' : 'w';
      if (spans[i].className !== state) spans[i].className=state;
    });
  }

  function renderPhone(s) {
    const introOut=animated(s,A.introClose,.65);
    $('intro').style.transform='translateY('+(105*introOut)+'%)';
    const opened=animated(s,A.offer,.6), closed=animated(s,A.home,.65);
    $('sanad').style.transform='translateY('+(105*(1-opened+closed))+'%)';
    $('dim').style.opacity=String(Math.max(1-introOut,opened*(1-closed)));
    const alerted=s>=A.notice, completed=s>=A.done;
    $('hintRisk').style.display=alerted && !completed ? '' : 'none';
    $('hintRisk').style.opacity=String(animated(s,A.notice,.4));
    $('hintCalm').style.display=alerted && !completed ? 'none' : '';
    $('hintCalm').style.opacity='1';
    $('hintCalmTxt').textContent=completed ? 'سَنَد: رصيدك يكفّيك لين الراتب' : s>=A.noura ? 'سَنَد يحسب رصيدك لين الراتب…' : 'سَنَد يتابع حسابك…';
    $('hintMin').textContent=completed ? '+150' : '';
    $('bellDot').style.opacity=alerted && !completed ? '1':'0';
    const mood=completed?'done':alerted?'need':'calm';
    document.querySelectorAll('.brand .orb, #narrOrb, #hintCalm .orb, #sheetOrb').forEach(el => {
      el.classList.toggle('need',mood==='need'); el.classList.toggle('done',mood==='done');
      el.classList.toggle('fast',s>=A.noura && s<A.notice);
    });
    $('moodLine').textContent=completed?'تم':'عندي لك شي مهم';
    $('moodDot').style.background=completed?'var(--a-good)':'';
    const amount=4200+500*animated(s,A.done,.8);
    $('bal').textContent=money(amount); $('doneBal').textContent=money(amount);
    $('savBal').firstChild.textContent=money(12000-500*animated(s,A.done,.8));
    $('shortNum').textContent=money(350*animated(s,A.offer,.85));
    $('gapFill').style.width=(92.3*animated(s,A.offer,1))+'%';
    let active='pOffer', phaseStart=A.offer;
    if(s>=A.why) {active='pWhy'; phaseStart=A.why;}
    if(s>=A.optionsBack) {active='pOffer'; phaseStart=A.optionsBack;}
    if(s>=A.options) {active='pOpts'; phaseStart=A.options;}
    if(s>=A.confirm) {active='pConfirm'; phaseStart=A.confirm;}
    if(s>=A.working) {active='pWorking'; phaseStart=A.working;}
    if(s>=A.done) {active='pDone'; phaseStart=A.done;}
    for(const id of phaseIds) {
      const el=$(id), visible=id===active;
      el.style.visibility=visible?'visible':'hidden'; el.setAttribute('aria-hidden',String(!visible));
      el.style.opacity=visible?String(animated(s,phaseStart,.25)):'0';
      el.style.transform='translateY('+(visible?10*(1-animated(s,phaseStart,.25)):0)+'px)';
    }
    $('backBtn').textContent=active==='pOffer'?'كلّمني':'رجوع';
    Array.from($('whyLines').children).forEach((row,i)=>row.style.opacity=String(animated(s,A.why+.18+i*.47,.22)));
    Array.from($('optList').children).forEach((row,i)=>row.style.opacity=String(animated(s,A.options+.1+i*.48,.25)));
    const scrollIn=animated(s,A.home+1.4,.95), scrollOut=animated(s,A.close-1.15,.85);
    $('homeScroll').style.transform='translateY('+(-300*scrollIn*(1-scrollOut))+'px)';
    $('endnote').classList.toggle('on',s>=A.close);
    renderFinger(s);
  }

  const taps = [
    {time:A.introClose-.9,id:'startBtn'},
    {time:A.offer-.85,id:'fixBtn'},
    {time:A.why-.85,id:'lnkWhy'},
    {time:A.optionsBack-.85,id:'backBtn'},
    {time:A.options-.85,id:'lnkOpts'},
    {time:A.confirm-.85,id:'bestOpt'},
    {time:A.working-.85,id:'confirmBtn'},
    {time:A.home-.85,id:'thanksBtn'}
  ];
  function renderFinger(s) {
    const finger=$('finger');
    const tap=taps.find(t=>s>=t.time && s<t.time+1.15);
    for(const item of taps) $(item.id).classList.toggle('pressed',!!tap && tap===item && s>item.time+.72 && s<item.time+.98);
    if(!tap || reduce) {finger.style.opacity='0';finger.classList.remove('tap');return;}
    const screen=$('screen').getBoundingClientRect(), target=$(tap.id).getBoundingClientRect(), scale=screen.width/390;
    const x=(target.left-screen.left+target.width/2)/scale, y=(target.top-screen.top+target.height/2)/scale;
    const p=ease(progress(s,tap.time,.72));
    finger.style.left=(x+55*(1-p))+'px';finger.style.top=(y+55*(1-p))+'px';
    finger.style.opacity=String(1-progress(s,tap.time+.98,.17));
    const pulse=progress(s,tap.time+.72,.4);
    finger.classList.toggle('tap',s>=tap.time+.72);
    finger.style.setProperty('--tap-scale',String(1+1.2*pulse));
    finger.style.setProperty('--tap-opacity',String(1-pulse));
  }

  function render(s,force=false) {
    if(interactive || (!force && s===lastRendered)) return;
    lastRendered=s;renderCaptions(s);renderPhone(s);
    if(s>=A.close)preparePhone();
    const pct=clamp(s/total)*100;
    $('fill').style.width=pct+'%';$('knob').style.left=pct+'%';
    seekBar.setAttribute('aria-valuenow',String(Math.round(pct)));
    seekBar.setAttribute('aria-valuetext',timeText(s)+' من '+timeText(total));
    $('timecode').textContent=timeText(s)+' / '+timeText(total);
  }
  function frame() {if(!interactive) render(audio.currentTime);requestAnimationFrame(frame);}
  function updateControls() {
    const running=!audio.paused && !audio.ended && !interactive;
    document.body.classList.toggle('demo-paused',!running);
    $('icoPause').style.display=running?'':'none';$('icoPlay').style.display=running?'none':'';
    const label=interactive?'أعد الشرح':running?'إيقاف مؤقت':audio.currentTime>0?'متابعة العرض':'ابدأ العرض';
    $('playTxt').textContent=label;$('playBtn').setAttribute('aria-label',label);
    $('soundTxt').textContent=audio.muted?'تشغيل الصوت':'كتم الصوت';
    $('soundBtn').setAttribute('aria-pressed',String(!audio.muted));
    $('soundBtn').setAttribute('aria-label',audio.muted?'تشغيل الصوت':'كتم الصوت');
    $('audioStatus').textContent=playbackError;
  }
  async function play() {
    const attempt=++playAttempt;
    playbackError='';
    try {await audio.play();}
    catch(error) {
      if(attempt!==playAttempt || error.name==='AbortError') return;
      playbackError=audio.error?'تعذّر تحميل التسجيل. أعد فتح العرض من المشغّل.':'اضغط «ابدأ العرض» لتشغيل الصوت.';
    }
    updateControls();
  }
  function pause() {playAttempt++;audio.pause();updateControls();}
  function replay() {leaveInteractive();pause();audio.currentTime=0;currentScene=-1;lastRendered=-1;render(0,true);play();}
  $('playBtn').addEventListener('click',()=>interactive?replay():audio.paused?play():pause());
  $('soundBtn').addEventListener('click',()=>{audio.muted=!audio.muted;updateControls();});
  for(const event of ['play','pause','volumechange']) audio.addEventListener(event,updateControls);
  audio.addEventListener('loadedmetadata',()=>{if(Number.isFinite(audio.duration))total=audio.duration;render(audio.currentTime,true);});
  audio.addEventListener('seeked',()=>render(audio.currentTime,true));
  audio.addEventListener('ended',()=>{render(total,true);enterInteractive();});
  audio.addEventListener('error',()=>{playbackError='تعذّر تحميل التسجيل. أعد فتح العرض من المشغّل.';updateControls();});

  function seek(seconds) {
    if(interactive) return;
    const point=Math.max(0,Math.min(total,seconds));
    if(point>=total) {enterInteractive();return;}
    audio.currentTime=point;render(point,true);updateControls();
  }
  function timeAt(x) {const r=$('prog').getBoundingClientRect();return clamp((x-r.left)/r.width)*total;}
  seekBar.addEventListener('pointerdown',event=>{
    if(interactive)return;
    dragResume=!audio.paused;pause();seekBar.classList.add('drag');seekBar.setPointerCapture(event.pointerId);seek(timeAt(event.clientX));
  });
  seekBar.addEventListener('pointermove',event=>{if(dragResume!==null && !interactive)seek(timeAt(event.clientX));});
  function endDrag(event) {
    if(dragResume===null)return;
    if(event.type==='pointerup' && !interactive)seek(timeAt(event.clientX));
    const resume=dragResume;dragResume=null;seekBar.classList.remove('drag');
    if(resume && !interactive)play();
  }
  seekBar.addEventListener('pointerup',endDrag);seekBar.addEventListener('pointercancel',endDrag);
  document.addEventListener('keydown',event=>{
    if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key===' ' && (event.target===document.body || event.target===seekBar)) {event.preventDefault();$('playBtn').click();}
    if(interactive)return;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft') {event.preventDefault();seek(audio.currentTime+(event.key==='ArrowRight'?5:-5));}
    if(event.key==='Home'||event.key==='End') {event.preventDefault();seek(event.key==='Home'?0:total);}
  });

  function enterInteractive() {
    if(interactive)return;
    pause();interactive=true;document.body.classList.add('interactive');
    document.body.classList.remove('demo-paused');
    $('chapN').textContent='✓';$('chapT').textContent='الحين دورك';
    cap.textContent='الحين دورك. جرّب سَنَد بنفسك.';
    $('tryHelp').hidden=false;$('tryBtn').hidden=true;$('resetDemoBtn').hidden=false;
    $('timecode').hidden=true;$('audioStatus').hidden=true;
    seekBar.setAttribute('aria-disabled','true');seekBar.tabIndex=-1;
    $('fill').style.width='100%';$('knob').style.left='100%';seekBar.setAttribute('aria-valuenow','100');
    preparePhone();
    liveFrame.hidden=false;
    if(phoneReady)$('demoStatus').textContent='التجربة جاهزة. جرّب سَنَد، والتحويل، والمحادثة، والإعدادات.';
    updateControls();fitSoon();
  }
  function preparePhone() {
    if(liveFrame)return;
    phoneReady=false;
    $('demoStatus').textContent='نجهّز لك التجربة التفاعلية…';
    liveFrame=document.createElement('iframe');liveFrame.id='livePhone';liveFrame.title='تجربة سَنَد المصرفية التفاعلية';
    liveFrame.hidden=true;liveFrame.src='phone/';$('screen').appendChild(liveFrame);
    loadTimer=setTimeout(()=>{$('demoStatus').textContent='التجربة تأخرت. اضغط «أعد السيناريو» للمحاولة من جديد.';},15000);
    if(location.protocol==='file:') {clearTimeout(loadTimer);$('demoStatus').textContent='شغّل ملف Start SANAD.command لفتح التجربة التفاعلية.';}
  }
  function leaveInteractive() {
    clearTimeout(loadTimer);phoneReady=false;interactive=false;document.body.classList.remove('interactive');
    if(liveFrame){liveFrame.remove();liveFrame=null;}
    $('tryHelp').hidden=true;$('tryBtn').hidden=false;$('resetDemoBtn').hidden=true;
    $('timecode').hidden=false;$('audioStatus').hidden=false;
    seekBar.removeAttribute('aria-disabled');seekBar.tabIndex=0;
    currentScene=-1;lastRendered=-1;
  }
  $('tryBtn').addEventListener('click',enterInteractive);
  $('resetDemoBtn').addEventListener('click',()=>{leaveInteractive();enterInteractive();});
  addEventListener('message',event=>{
    if(!liveFrame||event.source!==liveFrame.contentWindow||event.origin!==location.origin)return;
    if(event.data?.type==='sanad-ready') {phoneReady=true;clearTimeout(loadTimer);$('demoStatus').textContent='التجربة جاهزة. جرّب سَنَد، والتحويل، والمحادثة، والإعدادات.';}
    if(event.data?.type==='sanad-error') {clearTimeout(loadTimer);$('demoStatus').textContent='ما قدرنا نفتح التطبيق. اضغط «أعد السيناريو» للمحاولة من جديد.';}
  });
  for(const scene of data.scenes.slice(1)) {const tick=document.createElement('b');tick.style.left=(scene.start/total*100)+'%';$('prog').appendChild(tick);}
  updateControls();render(0,true);fitSoon();requestAnimationFrame(frame);
  if(new URLSearchParams(location.search).get('interactive')==='1')enterInteractive();
})();
