(function(){
'use strict';
var APP=document.getElementById('app'), SITE=null, CACHE={}, TIMER=null;
var MEM={};
function store(){ try{ return JSON.parse(localStorage.getItem('vh.v1'))||{}; }catch(e){ return MEM; } }
function save(s){ MEM=s; try{ localStorage.setItem('vh.v1',JSON.stringify(s)); }catch(e){} }
function S(){ var s=store(); s.days=s.days||{}; s.lessons=s.lessons||{}; s.cards=s.cards||{}; s.exams=s.exams||{}; s.proj=s.proj||{}; return s; }
function esc(t){ return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function $(sel,el){ return (el||document).querySelector(sel); }
function pad(n){ return n<10?'0'+n:''+n; }
function todayStr(){ var m=/[?&]bugun=(\d{4}-\d\d-\d\d)/.exec(location.search); if(m) return m[1]; var d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function dnum(s){ var p=s.split('-'); return Math.round(Date.UTC(+p[0],+p[1]-1,+p[2])/864e5); }
var MON=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
var DOW=['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
function dayName(s){ return DOW[new Date(dnum(s)*864e5).getUTCDay()]; }
function fdate(s){ if(!s) return ''; var p=s.split('-'); return (+p[2])+' '+MON[+p[1]-1]; }
function toast(msg){ var t=document.createElement('div'); t.className='toast'; t.setAttribute('role','status'); t.textContent=msg; document.body.appendChild(t); setTimeout(function(){ t.remove(); },2600); }

/* ---------- data ---------- */
function getJSON(u){ return fetch(u,{cache:'no-cache'}).then(function(r){ if(!r.ok) throw new Error(u); return r.json(); }); }
function course(code){ if(CACHE[code]) return Promise.resolve(CACHE[code]); return getJSON('data/'+code+'.json').then(function(d){ CACHE[code]=d; return d; }); }
function allCourses(){ return Promise.all(SITE.courses.map(function(c){ return course(c.code); })); }
function lessonById(c,id){ for(var i=0;i<c.lessons.length;i++) if(c.lessons[i].id===id) return c.lessons[i]; return null; }
function rich(t){ return esc(t).replace(/\[\[(.+?)\]\]/g,'<u>$1</u>'); }
function plain(t){ return String(t==null?'':t).replace(/\[\[|\]\]/g,''); }
function lessonTitle(c,id){ var l=lessonById(c,id); return l?l.title:id; }

function srcLink(src){ if(!src) return ''; if(/^https?:/.test(src)){ var host=src.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]; return '<a class="srclink" href="'+esc(src)+'" target="_blank" rel="noopener">Kaynak: '+esc(host)+'</a>'; } return '<span class="srclink">Kaynak: '+esc(src)+'</span>'; }
function sNote(c){ return (c.meta.source_note?'<p class="note srcnote"><strong>Önemli:</strong> '+esc(c.meta.source_note)+'</p>':''); }
function scopeNotes(c){ return (c.scope_notes||[]).map(function(t){ return '<p class="note scope">'+esc(t)+'</p>'; }).join(''); }
function est(c){ return c.format_estimate?' (tahmin)':''; }
function examLine(c){ var m=/^(\d{4}-\d\d-\d\d)\s+(\d\d:\d\d)/.exec(c.meta.exam||''); return m?'Sınav: '+fdate(m[1])+', saat '+m[2]:''; }
/* ---------- gemini ---------- */
function copyText(t){
  var ok=false;
  try{ var ta=document.createElement('textarea'); ta.value=t; ta.setAttribute('readonly',''); ta.style.cssText='position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0,t.length); ok=document.execCommand('copy'); ta.remove(); }catch(e){}
  if(navigator.clipboard&&navigator.clipboard.writeText){ try{ navigator.clipboard.writeText(t).catch(function(){}); ok=true; }catch(e){} }
  window.__lastCopy=t;
  return ok;
}
function askGemini(text){
  copyText(text);
  toast('Kopyalandı, Gemini’ye yapıştır');
  window.open('https://gemini.google.com/app','_blank','noopener');
}
function cardPrompt(c,card){
  return 'Ben bir üniversite öğrencisiyim. '+c.meta.course+' dersinden bu kartı anlamadım.\n\nSoru: '+card.front+'\nKartın cevabı: '+card.back+'\nDers: '+lessonTitle(c,card.lesson_id)+'\n\nBunu bana kısa ve sade bir dille anlat. Bir örnek ver. Bilmediğin bir şeyi uydurma.';
}
function qPrompt(c,q,mine){
  var o=function(k){ return k?(k+') '+plain(q.options[k])):'Boş bıraktım'; };
  var opts=Object.keys(q.options).map(function(k){ return k+') '+plain(q.options[k]); }).join('\n');
  return 'Ben bir üniversite öğrencisiyim. '+c.meta.course+' deneme sınavında bu soruyu yanlış yaptım ya da emin olamadım.\n\nSoru: '+plain(q.stem)+'\n'+opts+'\n\nBenim cevabım: '+o(mine)+'\nDoğru cevap: '+o(q.answer)+'\nDers: '+lessonTitle(c,q.lesson_id)+'\n\nNeden bu cevap doğru, benimki neden yanlış? Kısa ve sade anlat. Bilmediğin bir şeyi uydurma.';
}

/* ---------- shell ---------- */
function setNav(){
  var h=location.hash||'#/';
  var items=[['#/','Ana','Ana'],['#/plan','Plan','Plan']].concat(SITE.courses.map(function(c){ return ['#/k/'+c.code,c.code,c.code]; }));
  function cur(href){ return href==='#/'?(h==='#/'||h===''||h==='#'):h.indexOf(href)===0; }
  $('#tabbar').innerHTML=items.map(function(i){ return '<a href="'+i[0]+'"'+(cur(i[0])?' aria-current="page"':'')+'><b>'+esc(i[1])+'</b></a>'; }).join('');
  $('#railnav').innerHTML=items.map(function(i){ var lbl=i[0]==='#/'?'Ana sayfa':(i[0]==='#/plan'?'Çalışma planı':i[1]); var sp=i[0].indexOf('#/k/')===0?'DERS':''; return '<a href="'+i[0]+'"'+(cur(i[0])?' aria-current="page"':'')+'>'+esc(lbl)+'<span>'+sp+'</span></a>'; }).join('');
}

/* ---------- progress ---------- */
function progress(c){
  var s=S(), code=c.meta.course;
  var rd=Object.keys(s.lessons[code]||{}).filter(function(k){ return s.lessons[code][k]&&lessonById(c,k); }).length;
  var cb=s.cards[code]||{}, known=c.cards.filter(function(x){ return (cb[x.id]||0)>=2; }).length;
  var eb=s.exams[code]||{}, ex=c.exams.filter(function(e){ return eb[e.id]; }).length;
  return {rd:rd,nl:c.lessons.length,known:known,nc:c.cards.length,ex:ex,ne:c.exams.length};
}
function bar(label,a,b){ var p=b?Math.round(a/b*100):0; return '<div class="bar'+(b&&a===b?' done':'')+'"><span>'+label+'</span><span class="track"><span class="fill" style="width:'+p+'%"></span></span><em>'+a+'/'+b+'</em></div>'; }

/* ---------- views ---------- */
function planDayFor(t){ var d=SITE.plan; for(var i=0;i<d.length;i++) if(d[i].date===t) return d[i]; return t<d[0].date?d[0]:d[d.length-1]; }
function itemHtml(it,dark){
  return '<a href="'+it.href+'">'+esc(it.label)+(it.note?'<span>'+esc(it.note)+'</span>':'')+'</a>';
}
function viewHome(){
  var t=todayStr(), day=planDayFor(t), done=S().days[day.date];
  var ex=SITE.exams||[{label:'ATA101 + TUR101 sınavı',date:SITE.exam_date,time:'12:00'}];
  var up=ex.filter(function(e){ return e.date>=t; }), nx=up[0], rest=up.slice(1);
  var left=nx?dnum(nx.date)-dnum(t):0, big,sub;
  if(!nx){ big='0'; sub='Sınavlar geçti'; } else if(left>0){ big=String(left); sub='gün kaldı'; } else { big='0'; sub='Sınav bugün'; }
  return allCourses().then(function(cs){
    var h='<div class="topmark"><strong>Vize Hazırlık</strong><a class="howlink" href="#/nasil">Nasıl kullanılır?</a></div>';
    h+='<section class="hero"><div class="eyebrow">'+(nx?esc(nx.label):'Vize Hazırlık')+'</div><div class="num" aria-label="'+left+' gün kaldı">'+big+'</div><div><p class="big">'+sub+'</p><p class="sub">'+(nx?fdate(nx.date)+' '+dayName(nx.date)+', saat '+nx.time:'')+'</p></div></section>';
    if(rest.length) h+='<ul class="nextex">'+rest.map(function(e){ var d=dnum(e.date)-dnum(t); return '<li><strong>'+esc(e.label)+'</strong><span>'+fdate(e.date)+' '+dayName(e.date)+', saat '+e.time+' · '+d+' gün kaldı</span></li>'; }).join('')+'</ul>';
    if(nx){
      h+='<section class="today"><div class="eyebrow">Bugün ne çalışayım</div><h2>'+fdate(day.date)+', '+dayName(day.date)+'</h2>';
      if(day.date!==t) h+='<p class="eyebrow" style="margin-top:6px">Plan '+fdate(day.date)+' günüyle başlıyor</p>';
      if(day.exam) h+='<span class="tag">'+esc(day.exam)+'</span>';
      h+='<ul>'+day.items.map(function(it){ return '<li>'+itemHtml(it)+'</li>'; }).join('')+'</ul>';
      h+='<div class="btns"><button class="btn accent sm" id="donebtn" aria-pressed="'+(!!done)+'">'+(done?'Bu günü bitirdim (geri al)':'Bu günü bitirdim')+'</button><a class="btn ghost sm" href="#/plan">Tüm plan</a></div></section>';
    }
    h+='<section class="blk"><h2>Proje sınavları</h2><div class="list">'+PROJ.map(function(p){ var d=S().proj[p.code]||{}, n=p.todo.length, k=p.todo.filter(function(x){ return d[x[0]]; }).length; return '<a class="row" href="#/p/'+p.code+'"><span class="n">'+(+p.date.slice(8))+'</span><span class="t">'+p.code+' '+esc(p.name)+'<span class="s">'+fdate(p.date)+' '+dayName(p.date)+', saat '+p.time+'</span></span><span class="st'+(k===n?' ok':'')+'">'+k+'/'+n+'</span></a>'; }).join('')+'</div></section>';
    h+='<section class="blk"><h2>Dersler</h2><div class="courses">'+cs.map(function(c){ var p=progress(c);
      return '<a class="course" href="#/k/'+c.meta.course+'"><div class="code">'+c.meta.course+'</div><div class="nm">'+esc(c.meta.name)+(examLine(c)?'<br>'+examLine(c):'')+'</div>'+bar('Dersler',p.rd,p.nl)+bar('Kartlar',p.known,p.nc)+(p.ne?bar('Denemeler',p.ex,p.ne):'')+'</a>'; }).join('')+'</div></section>';
    return {html:h,after:function(){ var b=$('#donebtn'); if(b) b.onclick=function(){ var s=S(); s.days[day.date]=!s.days[day.date]; save(s); route(); }; }};
  });
}
function viewPlan(){
  var t=todayStr(), s=S();
  var h='<div class="topmark"><strong>Vize Hazırlık</strong></div><div class="ph"><div class="eyebrow">4 ile 15 Kasım</div><h1>Çalışma planı</h1><p>Yoğun günlerde çok, tasarım sınavı günlerinde az çalışırsın. Bitirdiğin günü işaretle.</p></div>';
  h+='<div>'+SITE.plan.map(function(d){
    var kind=d.kind==='heavy'?'Yoğun gün':d.kind==='light'?'Hafif gün':'Sınav günü';
    var isT=d.date===t, dn=s.days[d.date];
    return '<article class="day'+(isT?' today-d':'')+(dn?' done':'')+'" id="d'+d.date+'"><div><div class="dn">'+(+d.date.slice(8))+'</div><div class="dm">'+dayName(d.date).slice(0,3)+'</div></div><div><div class="kind '+d.kind+'">'+kind+(d.minutes?' · yaklaşık '+d.minutes+' dk':'')+'</div>'+(d.exam?'<div class="exam">'+esc(d.exam)+'</div>':'')+
      '<ul>'+d.items.map(function(it){ return '<li>'+itemHtml(it)+'</li>'; }).join('')+'</ul><button class="tick" data-d="'+d.date+'" aria-pressed="'+(!!dn)+'"><span class="box"></span>Bitirdim</button></div></article>'; }).join('')+'</div>';
  return Promise.resolve({html:h,after:function(){
    document.querySelectorAll('.tick').forEach(function(b){ b.onclick=function(){ var s=S(), d=b.getAttribute('data-d'); s.days[d]=!s.days[d]; save(s); b.setAttribute('aria-pressed',!!s.days[d]); b.closest('.day').classList.toggle('done',!!s.days[d]); }; });
    var el=document.getElementById('d'+t); if(el) el.scrollIntoView({block:'start'});
  }});
}
function head(c,title,crumb){ return '<a class="crumb" href="'+(crumb||'#/k/'+c.meta.course)+'">← '+(crumb?'Geri':c.meta.course)+'</a>'; }
function viewCourse(code){
  return course(code).then(function(c){
    var s=S(), rl=s.lessons[code]||{}, cb=s.cards[code]||{}, eb=s.exams[code]||{}, p=progress(c);
    var h='<a class="crumb" href="#/">← Ana sayfa</a><div class="ph"><div class="eyebrow">Ders</div><h1>'+code+'</h1><p>'+esc(c.meta.name)+(examLine(c)?' · '+examLine(c):'')+'</p></div>'+sNote(c)+scopeNotes(c);
    h+='<section class="blk"><h2>Dersler</h2><div class="list">'+c.lessons.map(function(l,i){ return '<a class="row" href="#/k/'+code+'/ders/'+l.id+'"><span class="n">'+(i+1)+'</span><span class="t">'+esc(l.title)+'<span class="s">'+(l.date?fdate(l.date):'Hafta '+l.week)+(l.duration_min?' · '+l.duration_min+' dk':'')+(l.partial?' · slayttan hazırlandı':'')+'</span></span><span class="st'+(rl[l.id]?' ok':'')+'">'+(rl[l.id]?'Okudum':'')+'</span></a>'; }).join('')+'</div></section>';
    h+='<section class="blk"><h2>Çalış</h2><div class="tools list">'+
      '<a class="row" href="#/k/'+code+'/ozet"><span class="n">1</span><span class="t">Sınav Özeti<span class="s">Bilmen gereken her şey tek sayfada</span></span><span></span></a>'+
      '<a class="row" href="#/k/'+code+'/kartlar"><span class="n">2</span><span class="t">Kartlar<span class="s">'+p.known+' / '+p.nc+' kart tamam</span></span><span></span></a>'+
      '<a class="row" href="#/k/'+code+'/gemini"><span class="n">3</span><span class="t">Gemini ile sor<span class="s">Dosyayı indir, Gemini’ye yükle</span></span><span></span></a></div></section>';
    if(c.exams.length) h+='<section class="blk"><h2>Denemeler</h2><div class="list">'+c.exams.map(function(e){ var r=eb[e.id]; return '<a class="row" href="#/k/'+code+'/deneme/'+e.id+'"><span class="n">'+e.id.replace(/\D+/g,'')+'</span><span class="t">'+esc(e.title)+'<span class="s">'+e.questions.length+' soru · '+e.minutes+' dk'+est(c)+'</span></span><span class="st'+(r?' ok':'')+'">'+(r?'En iyi '+r.best+'/'+r.total:'')+'</span></a>'; }).join('')+'</div></section>';
    h+='<section class="blk"><h2>PDF indir</h2><div class="list">'+(c.pdfs||[]).map(function(f){ return '<a class="row" href="'+f.href+'" download><span class="n">↓</span><span class="t">'+esc(f.label)+'<span class="s">PDF</span></span><span></span></a>'; }).join('')+'</div></section>';
    return {html:h};
  });
}
function viewLesson(code,id){
  return course(code).then(function(c){
    var l=lessonById(c,id); if(!l) return {html:'<p class="empty">Ders bulunamadı.</p>'};
    var i=c.lessons.indexOf(l), s=S(), rd=!!(s.lessons[code]||{})[id];
    var h='<a class="crumb" href="#/k/'+code+'">← '+code+'</a><div class="ph"><div class="eyebrow">'+(l.date?fdate(l.date):'Hafta '+l.week)+(l.duration_min?' · '+l.duration_min+' dk ders':'')+'</div><h1>'+esc(l.title)+'</h1></div>'+sNote(c)+(l.partial?'<p class="note scope"><strong>Bu ders:</strong> '+esc(l.partial)+'.</p>':'')+(l.scope_topics?'<p class="note">Vize konusu: '+esc(l.scope_topics.join(', '))+'.</p>':'');
    var so=false; try{ so=localStorage.getItem('vh.src')==='1'; }catch(e){}
    h+='<div class="summary"><span class="eyebrow">Kısa özet</span>'+esc(l.summary)+'</div><div class="srcbar"><button class="btn ghost sm" id="srcbtn" aria-pressed="'+so+'">'+(so?'Kaynakları gizle':'Kaynakları göster')+'</button></div><article class="prose'+(so?' showsrc':'')+'" id="prose">'+l.notes_html+'</article>';
    h+='<div class="btns"><button class="btn accent" id="rdbtn" aria-pressed="'+rd+'">'+(rd?'Okudum (geri al)':'Okudum')+'</button><a class="btn ghost" href="#/k/'+code+'/kartlar?ders='+id+'">Bu dersin kartları</a></div>';
    h+='<div class="pager">'+(i>0?'<a class="btn ghost sm" href="#/k/'+code+'/ders/'+c.lessons[i-1].id+'">← Önceki</a>':'<span></span>')+(i<c.lessons.length-1?'<a class="btn ghost sm" href="#/k/'+code+'/ders/'+c.lessons[i+1].id+'">Sonraki →</a>':'<span></span>')+'</div>';
    return {html:h,after:function(){ $('#srcbtn').onclick=function(){ var p=$('#prose'), on=p.classList.toggle('showsrc'); this.setAttribute('aria-pressed',on); this.textContent=on?'Kaynakları gizle':'Kaynakları göster'; try{ localStorage.setItem('vh.src',on?'1':'0'); }catch(e){} };
      $('#rdbtn').onclick=function(){ var s=S(); s.lessons[code]=s.lessons[code]||{}; s.lessons[code][id]=!s.lessons[code][id]; save(s); route(true); }; }};
  });
}
function viewCheat(code){
  return course(code).then(function(c){
    var pdf=(c.pdfs||[]).filter(function(f){ return f.kind==='cheat'; })[0];
    return {html:'<a class="crumb" href="#/k/'+code+'">← '+code+'</a><div class="ph"><div class="eyebrow">'+code+'</div><h1>Sınav Özeti</h1></div>'+sNote(c)+'<article class="prose">'+c.cheat_html+'</article>'+(pdf?'<div class="btns"><a class="btn ghost" href="'+pdf.href+'" download>Sınav Özeti PDF indir</a></div>':'')};
  });
}
/* flashcards */
function viewCards(code,q){
  return course(code).then(function(c){
    var ders=q.ders, mode=q.mod, s=S(); s.cards[code]=s.cards[code]||{};
    var box=s.cards[code];
    var dl=ders?ders.split(','):null;
    var pool=c.cards.filter(function(x){ return !dl||dl.indexOf(x.lesson_id)>=0; });
    var queue=pool.filter(function(x){ return (box[x.id]||0)<2; });
    if(mode==='zayif'){ var w=queue.filter(function(x){ return box[x.id]===1; }); if(w.length) queue=w; }
    queue.sort(function(a,b){ return (box[a.id]||0)-(box[b.id]||0); });
    var total=queue.length, doneN=0, flipped=false;
    var title=ders?(dl.length>1?'Bugünün dersleri':lessonTitle(c,ders)):(mode==='zayif'?'Tekrar kartları':'Tüm kartlar');
    function render(){
      var h='<a class="crumb" href="#/k/'+code+'">← '+code+'</a><div class="ph"><div class="eyebrow">Kartlar</div><h1 style="font-size:clamp(28px,6vw,44px)">'+esc(title)+'</h1></div>'+sNote(c);
      if(!queue.length){
        h+='<p class="note">'+(pool.length?'Bu destedeki tüm kartları biliyorsun.':'Bu ders için kart yok.')+'</p><div class="btns"><button class="btn" id="reset">Kartları sıfırla</button><a class="btn ghost" href="#/k/'+code+'">Derse dön</a></div>';
        APP.innerHTML=h; var r=$('#reset'); if(r) r.onclick=function(){ pool.forEach(function(x){ delete box[x.id]; }); save(s); route(true); }; return;
      }
      var cd=queue[0], b=box[cd.id]||0;
      h+='<div class="fc-top"><span>'+queue.length+' kart kaldı</span><span class="box-dots" aria-label="Kutu '+Math.max(b,1)+'">'+[1,2,3].map(function(n){ return '<i class="'+(n<=Math.max(b,1)?'on':'')+'"></i>'; }).join('')+'</span></div>';
      h+='<button class="flip'+(flipped?' on':'')+'" id="flip" aria-label="Kartı çevir"><div class="in"><div class="face front"><div class="q">'+esc(cd.front)+'</div><div class="hint">Cevabı görmek için dokun</div></div><div class="face back"><div class="q">'+esc(cd.back)+'</div><div class="hint">'+esc(lessonTitle(c,cd.lesson_id))+'<br>'+srcLink(cd.src)+'</div></div></div></button>';
      h+='<div class="answer-row"><button class="btn ghost" id="again"'+(flipped?'':' disabled')+'>Tekrar göster</button><button class="btn accent" id="know"'+(flipped?'':' disabled')+'>Biliyorum</button></div>';
      h+='<p class="howto"><b>Biliyorum:</b> kart bitti sayılır. <b>Tekrar göster:</b> kart birkaç kart sonra yine gelir.</p>';
      h+='<button class="btn ghost sm ask" id="ask">Gemini’ye sor</button>';
      APP.innerHTML=h;
      $('#flip').onclick=function(){ flipped=!flipped; $('#flip').classList.toggle('on',flipped); $('#again').disabled=!flipped; $('#know').disabled=!flipped; };
      $('#know').onclick=function(){ box[cd.id]=3; save(s); queue.shift(); flipped=false; render(); };
      $('#again').onclick=function(){ box[cd.id]=1; save(s); queue.shift(); queue.splice(Math.min(4,queue.length),0,cd); flipped=false; render(); };
      $('#ask').onclick=function(){ askGemini(cardPrompt(c,cd)); };
    }
    return {raw:render};
  });
}
/* exam */
function viewExam(code,eid){
  return course(code).then(function(c){
    var ex=null; c.exams.forEach(function(e){ if(e.id===eid) ex=e; });
    if(!ex) return {html:'<p class="empty">Deneme bulunamadı.</p>'};
    var s=S(), runKey='vh.run.'+code+'.'+eid;
    function getRun(){ try{ return JSON.parse(localStorage.getItem(runKey)); }catch(e){ return MEM[runKey]||null; } }
    function setRun(r){ try{ if(r) localStorage.setItem(runKey,JSON.stringify(r)); else localStorage.removeItem(runKey); }catch(e){ MEM[runKey]=r; } }
    var run=getRun();
    function intro(){
      var best=(s.exams[code]||{})[eid];
      var h='<a class="crumb" href="#/k/'+code+'">← '+code+'</a><div class="ph"><div class="eyebrow">Deneme</div><h1>'+esc(ex.title)+'</h1><p>'+ex.questions.length+' soru · '+ex.minutes+' dakika'+est(c)+' · tek tek ekranlar</p></div>'+sNote(c)+(c.format_estimate?'<p class="note scope">'+esc(c.meta.format_line||'Bu dersin sınav biçimi (soru sayısı, süre, şık sayısı) kayıtlarda yok, tahmin. Gerçek sınavda farklı olabilir.')+'</p>':'')+(ex.note?'<p class="note scope">'+esc(ex.note)+'</p>':'');
      if(best) h+='<p class="note">En iyi skorun: <strong>'+best.best+' / '+best.total+'</strong></p>';
      if(run&&!run.done) h+='<p class="note">Yarım kalan sınavın var. Süre işlemeye devam etti.</p><div class="btns"><button class="btn accent" id="resume">Devam et</button><button class="btn ghost" id="fresh">Baştan başla</button></div>';
      else h+='<div class="btns"><button class="btn accent" id="start">Sınavı başlat</button></div>';
      APP.innerHTML=h;
      var st=$('#start'), rs=$('#resume'), fr=$('#fresh');
      function begin(){ run={start:Date.now(),deadline:Date.now()+ex.minutes*60000,idx:0,ans:{},done:false}; setRun(run); question(); }
      if(st) st.onclick=begin; if(fr) fr.onclick=begin; if(rs) rs.onclick=question;
    }
    function left(){ return Math.max(0,Math.round((run.deadline-Date.now())/1000)); }
    function fmt(sec){ return pad(Math.floor(sec/60))+':'+pad(sec%60); }
    function finish(){ clearInterval(TIMER); document.body.classList.remove('focus'); run.done=true; run.end=Math.min(Date.now(),run.deadline); setRun(run); var sc=score(); var s2=S(); s2.exams[code]=s2.exams[code]||{}; var prev=s2.exams[code][eid]; s2.exams[code][eid]={best:Math.max(sc,prev?prev.best:0),total:ex.questions.length,last:sc}; save(s2); result(); }
    function score(){ var n=0; ex.questions.forEach(function(q){ if(run.ans[q.id]===q.answer) n++; }); return n; }
    function question(){
      clearInterval(TIMER);
      if(left()<=0){ return finish(); }
      var q=ex.questions[run.idx], n=ex.questions.length, last=run.idx===n-1, un=ex.questions.filter(function(x){ return !run.ans[x.id]; }).length;
      var h='<div class="ex-top"><span class="cnt">'+(run.idx+1)+' / '+n+'</span><span class="tm" id="tm">'+fmt(left())+'</span></div><div class="prog"><div style="width:'+((run.idx+1)/n*100)+'%"></div></div>';
      h+='<p class="stem">'+rich(q.stem)+'</p><div class="opts">'+Object.keys(q.options).map(function(k){ return '<button class="opt" data-k="'+k+'" aria-pressed="'+(run.ans[q.id]===k)+'"><b>'+k+'</b><span>'+rich(q.options[k])+'</span></button>'; }).join('')+'</div>';
      h+='<div class="exnav"><button class="btn ghost" id="prev"'+(run.idx===0?' disabled':'')+'>← Geri</button>'+(last?'<button class="btn accent" id="fin">Bitir</button>':'<button class="btn" id="next">İleri →</button>')+'</div>';
      if(last&&un) h+='<p class="note" id="warn" hidden>'+un+' soru boş. Yine de bitirmek için tekrar “Bitir”e bas.</p>';
      APP.innerHTML=h; window.scrollTo(0,0); document.body.classList.add('focus');
      document.querySelectorAll('.opt').forEach(function(b){ b.onclick=function(){ var k=b.getAttribute('data-k'); if(run.ans[q.id]===k) delete run.ans[q.id]; else run.ans[q.id]=k; setRun(run); question(); }; });
      var pv=$('#prev'), nx=$('#next'), fn=$('#fin');
      if(pv) pv.onclick=function(){ run.idx--; setRun(run); question(); };
      if(nx) nx.onclick=function(){ run.idx++; setRun(run); question(); };
      if(fn){ var armed=false; fn.onclick=function(){ if(un&&!armed){ armed=true; $('#warn').hidden=false; fn.textContent='Evet, bitir'; return; } finish(); }; }
      TIMER=setInterval(function(){ var t=$('#tm'); if(!t){ clearInterval(TIMER); return; } var l=left(); t.textContent=fmt(l); t.classList.toggle('low',l<=60); if(l<=0) finish(); },1000);
    }
    function result(){
      var n=ex.questions.length, sc=score(), wrongOnly=false;
      function paint(){
        var h='<a class="crumb" href="#/k/'+code+'">← '+code+'</a><div class="ph"><div class="eyebrow">'+esc(ex.title)+' · sonuç</div><div class="score" aria-label="'+sc+' doğru, '+n+' soru">'+sc+'<small> / '+n+'</small></div><p>%'+Math.round(sc/n*100)+' doğru · '+fmt(Math.max(0,Math.round(((run.end||Date.now())-run.start)/1000)))+' sürdü</p>'+
          '<div class="btns"><button class="btn accent" id="again">Yeniden çöz</button><button class="btn ghost" id="filter" aria-pressed="'+wrongOnly+'">'+(wrongOnly?'Hepsini göster':'Sadece yanlışlar')+'</button></div></div>';
        h+=ex.questions.map(function(q,i){
          var mine=run.ans[q.id], ok=mine===q.answer; if(wrongOnly&&ok) return '';
          return '<article class="rev"><span class="stat '+(ok?'ok':'no')+'">Soru '+(i+1)+' · '+(ok?'Doğru':(mine?'Yanlış':'Boş'))+'</span><p class="st">'+rich(q.stem)+'</p>'+
            '<p class="ans">Senin cevabın: <strong>'+(mine?mine+') '+rich(q.options[mine]):'boş')+'</strong></p><p class="ans">Doğru cevap: <strong>'+q.answer+') '+rich(q.options[q.answer])+'</strong></p>'+
            '<div class="exp">'+esc(q.explanation)+'</div><p class="src">Ders: <a href="#/k/'+code+'/ders/'+q.lesson_id+'">'+esc(lessonTitle(c,q.lesson_id))+'</a> · '+srcLink(q.src)+'</p><button class="btn ghost sm ask" data-q="'+i+'">Gemini’ye sor</button></article>'; }).join('');
        APP.innerHTML=h; window.scrollTo(0,0);
        $('#again').onclick=function(){ setRun(null); run=null; intro(); };
        $('#filter').onclick=function(){ wrongOnly=!wrongOnly; paint(); };
        document.querySelectorAll('[data-q]').forEach(function(b){ b.onclick=function(){ var q=ex.questions[+b.getAttribute('data-q')]; askGemini(qPrompt(c,q,run.ans[q.id])); }; });
      }
      paint();
    }
    return {raw:function(){ if(run&&run.done) result(); else if(run&&left()<=0){ finish(); } else intro(); }};
  });
}
function viewGemini(code){
  return course(code).then(function(c){
    var h='<a class="crumb" href="#/k/'+code+'">← '+code+'</a><div class="ph"><div class="eyebrow">'+code+'</div><h1>Gemini ile sor</h1><p>Tüm notlar tek dosyada. Gemini dosyaya bakarak cevap verir.</p></div>'+sNote(c);
    h+='<ol class="steps"><li><div><strong>Gemini’yi aç</strong>Telefonda Gemini uygulamasını aç.</div></li><li><div><strong>Dosyayı ekle</strong>Aşağıdan dosyayı indir. Gemini’de + işaretine bas, dosyayı seç.</div></li><li><div><strong>Promptu yapıştır</strong>“Promptu kopyala”ya bas, Gemini’nin yazı kutusuna yapıştır, gönder.</div></li></ol>';
    h+='<div class="btns"><a class="btn accent" href="'+c.gemini_file+'" download="'+code+'-gemini.txt">Dosyayı indir (.txt)</a><button class="btn ghost" id="cp">Promptu kopyala</button><a class="btn ghost" href="https://gemini.google.com/app" target="_blank" rel="noopener">Gemini’yi aç</a></div>';
    h+='<h2 style="font-size:22px;margin-top:32px">Prompt</h2><div class="promptbox">'+esc(c.gemini_prompt)+'</div>';
    h+='<p class="note">Her seferinde dosya eklemek istemezsen: Gemini’de bir Gem oluştur, bu dosyayı ve promptu Gem’e kaydet. Sonra hep o Gem’i aç.</p>';
    return {html:h,after:function(){ $('#cp').onclick=function(){ copyText(c.gemini_prompt); toast('Kopyalandı, Gemini’ye yapıştır'); }; }};
  });
}


/* ---------- guide + project exams ---------- */
var PROJ=[], GUIDE=null;
function viewGuide(){
  return Promise.resolve({html:'<a class="crumb" href="#/">← Ana sayfa</a><div class="ph"><div class="eyebrow">Kısa rehber</div><h1>Nasıl kullanılır</h1><p>Her gün bu kadar.</p></div><article class="prose guide">'+GUIDE.html+'</article><div class="btns"><a class="btn accent" href="'+GUIDE.pdf+'" download>Rehberi PDF indir</a></div>'});
}
function viewProjects(){
  return Promise.resolve({html:'<a class="crumb" href="#/">← Ana sayfa</a><div class="ph"><div class="eyebrow">Tasarım dersleri</div><h1>Proje sınavları</h1><p>Her dersin sınav günü, teslim şartı, kriterleri ve kontrol listesi.</p></div><div class="list">'+PROJ.map(function(p){ return '<a class="row" href="#/p/'+p.code+'"><span class="n">'+(+p.date.slice(8))+'</span><span class="t">'+p.code+' '+esc(p.name)+'<span class="s">'+fdate(p.date)+' '+dayName(p.date)+', saat '+p.time+'</span></span><span></span></a>'; }).join('')+'</div>'});
}
function viewProject(code){
  var p=null; PROJ.forEach(function(x){ if(x.code===code) p=x; });
  if(!p) return Promise.resolve({html:'<p class="empty">Sayfa bulunamadı. <a href="#/">Ana sayfa</a></p>'});
  var d=S().proj[code]||{};
  function ul(a){ return '<ul>'+a.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul>'; }
  var h='<a class="crumb" href="#/">← Ana sayfa</a><div class="ph"><div class="eyebrow">Proje sınavı · '+esc(p.teacher)+'</div><h1>'+p.code+'</h1><p>'+esc(p.name)+'</p></div>';
  h+='<div class="exbox"><div><span class="eyebrow">Gün</span><b>'+fdate(p.date)+' '+dayName(p.date)+'</b></div><div><span class="eyebrow">Saat</span><b>'+p.time+'</b></div><div><span class="eyebrow">Salon</span><b>'+(p.room||'Yazmıyor')+'</b></div></div>';
  if(p.room_note) h+='<p class="note scope">'+esc(p.room_note)+'</p>';
  h+='<section class="blk"><h2>Hocanın yazdığı</h2><dl class="kv">'+p.known.map(function(k){ return '<dt>'+esc(k[0])+'</dt><dd>'+esc(k[1])+'</dd>'; }).join('')+'</dl></section>';
  if(p.projects.length) h+='<section class="blk"><h2>Projeler</h2>'+p.projects.map(function(x){ return '<article class="proj"><h3>'+esc(x[0])+'</h3><blockquote>'+esc(x[1])+'</blockquote></article>'; }).join('')+'</section>';
  if(p.criteria.length) h+='<section class="blk"><h2>Puan kriterleri</h2>'+p.criteria.map(function(c){ return '<h3 class="ch">'+esc(c[0])+'</h3><div class="crit">'+c[1].map(function(r){ return '<div class="cr"><div><b>'+esc(r[0])+'</b><span>'+esc(r[1])+'</span></div><em>'+r[2]+' puan</em></div>'; }).join('')+'</div>'; }).join('')+'</section>';
  if(p.images&&p.images.length) h+='<section class="blk"><h2>Hocanın örnek çizimleri</h2>'+p.images.map(function(im){ return '<figure class="fig"><img src="'+im[0]+'" alt="'+esc(im[1])+'" loading="lazy"><figcaption>'+esc(im[1])+'</figcaption></figure>'; }).join('')+'</section>';
  if(p.bring.length) h+='<section class="blk"><h2>Getir</h2>'+ul(p.bring)+'</section>';
  if(p.topics) h+='<p class="note">'+esc(p.topics)+'</p>';
  h+='<section class="blk"><h2>Hocaya sor</h2><ul class="ask-list">'+p.unclear.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul></section>';
  h+='<section class="blk"><h2>Kontrol listesi</h2><div class="checks">'+p.todo.map(function(x){ return '<button class="chk" data-i="'+x[0]+'" aria-pressed="'+(!!d[x[0]])+'"><span class="box"></span><span>'+esc(x[1])+'</span></button>'; }).join('')+'</div></section>';
  return Promise.resolve({html:h,after:function(){ document.querySelectorAll('.chk').forEach(function(b){ b.onclick=function(){ var s=S(), i=b.getAttribute('data-i'); s.proj[code]=s.proj[code]||{}; s.proj[code][i]=!s.proj[code][i]; save(s); b.setAttribute('aria-pressed',!!s.proj[code][i]); }; }); }});
}

/* ---------- router ---------- */
function parseQ(s){ var o={}; (s||'').split('&').forEach(function(p){ if(!p) return; var a=p.split('='); o[a[0]]=decodeURIComponent(a[1]||''); }); return o; }
function route(keep){
  clearInterval(TIMER); document.body.classList.remove('focus');
  var raw=(location.hash||'#/').slice(1), qi=raw.indexOf('?'), path=qi<0?raw:raw.slice(0,qi), q=parseQ(qi<0?'':raw.slice(qi+1));
  var p=path.split('/').filter(Boolean), y=window.scrollY, v;
  setNav();
  if(!p.length) v=viewHome();
  else if(p[0]==='plan') v=viewPlan();
  else if(p[0]==='nasil') v=viewGuide();
  else if(p[0]==='projeler') v=viewProjects();
  else if(p[0]==='p'&&p[1]) v=viewProject(p[1]);
  else if(p[0]==='k'&&p[1]&&SITE.courses.some(function(c){ return c.code===p[1]; })){
    if(!p[2]) v=viewCourse(p[1]);
    else if(p[2]==='ders') v=viewLesson(p[1],p[3]);
    else if(p[2]==='ozet') v=viewCheat(p[1]);
    else if(p[2]==='kartlar') v=viewCards(p[1],q);
    else if(p[2]==='deneme') v=viewExam(p[1],p[3]);
    else if(p[2]==='gemini') v=viewGemini(p[1]);
  }
  if(!v) v=Promise.resolve({html:'<p class="empty">Sayfa bulunamadı. <a href="#/">Ana sayfa</a></p>'});
  v.then(function(r){ if(r.raw){ r.raw(); } else { APP.innerHTML=r.html; if(r.after) r.after(); } if(keep===true) window.scrollTo(0,y); else if(!r.raw) window.scrollTo(0,0); document.title=p[0]==='k'?(p[1]+' · Vize Hazırlık'):(p[0]==='p'&&p[1]?(p[1]+' proje sınavı · Vize Hazırlık'):'Vize Hazırlık'); })
   .catch(function(e){ APP.innerHTML='<p class="empty">Yüklenemedi. Sayfayı yenile.</p>'; console.error(e); });
}
window.addEventListener('hashchange',function(){ route(); });
Promise.all([getJSON('data/site.json'),getJSON('data/projeler.json'),getJSON('data/guide.json')]).then(function(r){
  var s=r[0]; PROJ=r[1]; GUIDE=r[2]; SITE=s;
  if(s.sample){ var b=document.createElement('div'); b.className='sample'; b.textContent=s.sample; document.body.prepend(b); }
  document.querySelectorAll('.stamp-v').forEach(function(e){ e.textContent='Sürüm '+s.build; });
  route();
}).catch(function(){ APP.innerHTML='<p class="empty">Yüklenemedi. Sayfayı yenile.</p>'; });
})();
