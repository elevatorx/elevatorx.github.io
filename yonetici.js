(function(){'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={new:'Bildirildi',seen:'İşleme alındı',en_route:'Personel yolda',resolved:'Tamamlandı'},categories={door:'Kapı sorunu',stopped:'Asansör çalışmıyor',noise:'Ses / titreşim',lighting:'Aydınlatma',other:'Diğer'};
let client,user=null,apartments=[],current=null,reports=[],signup=false,recovery=false,epoch=0,busy=false,submitting=false,requestId=null,savedFault=null,lastFocus=null,notifyWarning="";
const uuid=()=>crypto.randomUUID?crypto.randomUUID():([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
let visibleLimit=6;
let view='overview',reportFilter='active',reportsReady=false,reportsError='',photoEpoch=0;
let receipts=[],receiptsReady=false,receiptsError='',receiptLimit=6;
let invite='';try{const fragment=new URLSearchParams(location.hash.slice(1));const token=fragment.get('davet');if(token&&/^[a-f0-9]{64}$/.test(token)){sessionStorage.setItem('abrManagerInvite',token);history.replaceState(null,'',location.pathname+location.search);}invite=sessionStorage.getItem('abrManagerInvite')||'';}catch(e){}
try{recovery=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';}catch(e){}
$('inviteNotice').hidden=!invite;
const phone=s=>String(s||'').replace(/[^+\d]/g,'');
function date(s,withTime=false){if(!s)return 'Bilgi paylaşılmadı';const d=new Date(s);return isNaN(d)?String(s):d.toLocaleString('tr-TR',withTime?{dateStyle:'medium',timeStyle:'short'}:{dateStyle:'long'});}
function errorText(e){const msg=String(e&&e.message||e||'İşlem tamamlanamadı.');if(/PGRST202|PGRST205|does not exist|schema cache/.test(msg))return 'Yönetici portalı henüz firma tarafından etkinleştirilmemiş.';if(/AbortError|aborted|Failed to fetch|NetworkError|fetch failed/i.test(msg))return 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.';if(/row-level security/i.test(msg))return 'Fotoğraf yükleme izni reddedildi. Firma yükleme izinlerini güncellemeli.';if(/Invalid login credentials/.test(msg))return 'E-posta veya şifre yanlış.';if(/Email not confirmed/.test(msg))return 'Giriş yapmadan önce e-posta adresinizi doğrulayın.';if(/rate limit|too many/i.test(msg))return 'Çok sık deneme yapıldı. Biraz sonra tekrar deneyin.';return msg.slice(0,250);}
function message(id,text,isError=true){const el=$(id);el.textContent=text;el.hidden=!text;el.classList.toggle('error',isError);}
async function rpc(name,args={}){const r=await client.rpc(name,args);if(r.error)throw r.error;return r.data;}
function resetDraft(){savedFault=null;requestId=null;['files','description','category','priority'].forEach(id=>$(id).disabled=false);$('faultForm').reset();}
function setAuth(){if($('photoViewer').open)$('photoViewer').close();$('photoImage').removeAttribute('src');epoch++;user=null;current=null;apartments=[];reports=[];reportsReady=false;reportsError='';view='overview';reportFilter='active';visibleLimit=6;resetReceipts();resetDraft();closeModal('reportModal');closeModal('detailModal');$('auth').hidden=false;$('app').hidden=true;$('bottom').hidden=true;$('logout').hidden=true;$('recovery').hidden=true;$('overview').replaceChildren();$('reports').replaceChildren();$('receipts').replaceChildren();}
function authMode(value){signup=value;$('loginTab').classList.toggle('active',!signup);$('signupTab').classList.toggle('active',signup);$('authSubmit').textContent=signup?'Hesap oluştur':'Giriş yap';$('password').autocomplete=signup?'new-password':'current-password';message('authError','');}
async function load(){if(busy||!user||recovery||document.hidden)return;busy=true;const ticket=++epoch;try{
 if(invite){await rpc('abr_mgr_accept',{p_token:invite});if(ticket!==epoch)return;invite='';sessionStorage.removeItem('abrManagerInvite');$('inviteNotice').hidden=true;}
 const list=await rpc('abr_mgr_my_apartments');if(ticket!==epoch)return;
 const old=current&&current.id;apartments=Array.isArray(list)?list:[];current=apartments.find(a=>a.id===old)||apartments[0]||null;if(!current||current.id!==old){resetReceipts();reports=[];reportsReady=false;reportsError='';closeModal('detailModal');if($('photoViewer').open)$('photoViewer').close();$('photoImage').removeAttribute('src');}
 $('auth').hidden=true;$('recovery').hidden=true;$('app').hidden=false;$('logout').hidden=false;$('noAccess').hidden=!!current;$('bottom').hidden=!current;
 $('apartmentSelect').hidden=apartments.length<2;$('apartmentSelect').innerHTML=apartments.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.snapshot.name)+'</option>').join('');if(current)$('apartmentSelect').value=current.id;
 if(!current){resetDraft();$('apartmentTitle').textContent='Apartmanım';$('hello').textContent='Merhaba';$('syncTime').textContent='';$('overview').replaceChildren();$('reports').replaceChildren();closeModal('reportModal');closeModal('detailModal');message('appError','');return;}
 renderOverview();await Promise.allSettled([loadReports(ticket),loadReceipts(ticket)]);if(ticket===epoch)message('appError','');
 }catch(e){if(ticket!==epoch)return;if(invite){message('authError',errorText(e));$('auth').hidden=false;$('logout').hidden=false;message('inviteNotice','Davet kabul edilemedi. Doğru hesapla giriş yaptığınızdan emin olun. Yeni davet için firmanızla iletişime geçin.',false);}else{message('appError',errorText(e));$('app').hidden=false;$('auth').hidden=true;$('bottom').hidden=!current;}}finally{busy=false;}}
function switchView(next){
 const previous=view;view=['reports','receipts'].includes(next)?next:'overview';if(previous!==view)$('app').scrollTop=0;document.body.dataset.portalView=view;$('overview').hidden=view!=='overview';$('reportsPanel').hidden=view!=='reports';$('receiptsPanel').hidden=view!=='receipts';
 document.querySelectorAll('[data-view]').forEach(b=>{const selected=b.dataset.view===view;b.classList.toggle('active',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}
function progress(r){
 const order=['new','seen','en_route','resolved'],index=order.indexOf(r.status);
 return '<ol class="progress" aria-label="Arıza durumu">'+order.map((status,i)=>'<li class="'+(i<=index?'done':'')+(i===index?' current':'')+'"><i aria-hidden="true"></i><span>'+esc(labels[status])+'</span></li>').join('')+'</ol>';
}
function renderOverview(){
 if(!current)return;
 const s=current.snapshot||{};$('apartmentTitle').textContent=s.name||'Apartmanım';$('hello').textContent='Merhaba, '+(current.manager_name||'Yönetici');$('syncTime').textContent='Son güncelleme · '+date(current.updated_at,true);
 const lm=s.last_maintenance?new Date(s.last_maintenance):null,now=new Date();
 const thisMonth=lm&&!isNaN(lm)&&lm.getMonth()===now.getMonth()&&lm.getFullYear()===now.getFullYear();
 const active=reports.filter(r=>r.status!=='resolved').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)),featured=active[0];
 const rawLabel=String(s.inspection_label||'').toLocaleLowerCase('tr-TR');
 const labelNames={kirmizi:'Kırmızı',kırmızı:'Kırmızı',sari:'Sarı',sarı:'Sarı',mavi:'Mavi',yesil:'Yeşil',yeşil:'Yeşil'};
 const labelClass={kirmizi:'red',kırmızı:'red',sari:'amber',sarı:'amber',mavi:'blue',yesil:'green',yeşil:'green'}[rawLabel]||'neutral';
 const number=phone(s.phone);
 let reportSummary=reportsError?'Bildirimler yüklenemedi':!reportsReady?'Bildirimler yükleniyor…':active.length?active.length+' açık bildiriminiz var':'Açık arıza bildiriminiz yok';
 const reportHint=reportsError?'Yeniden denemek için dokunun':!reportsReady?'Lütfen bekleyin':featured?esc(categories[featured.category]||'Arıza bildirimi')+' · '+esc(labels[featured.status]||'Bildirildi'):'Geçmiş bildirimlerinizi görebilirsiniz';
 const expanded=$('buildingInfo')&&$('buildingInfo').open;
 const glyph=(path)=>'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="'+path+'" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
 const bell=glyph('M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4');
 const call=glyph('M7 3H4a1 1 0 0 0-1 1c0 9 8 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a15 15 0 0 1-7-7l2-2-2-5Z');
 const doc=glyph('M6 3h8l4 4v14H6V3ZM14 3v5h4M9 12h6M9 16h4');
 const calendar=glyph('M5 5h14v15H5V5ZM8 3v4M16 3v4M5 10h14M9 14h2M13 14h2');
 $('overview').innerHTML='<section class="maintenance-hero"><div class="hero-caption"><span>BAKIM ÖZETİ</span><span class="hero-emblem">'+calendar+'</span></div><div class="hero-date">'+esc(date(s.last_maintenance))+'</div><div class="hero-state '+(thisMonth?'recorded':'pending')+'"><i></i>'+(thisMonth?'Bu ayın bakımı kaydedildi':'Bu ay için bakım kaydı bulunmuyor')+'</div><div class="hero-bottom"><span>Son bakım kaydı</span><span>'+esc(s.company||'Bakım firmanız')+'</span></div></section><div class="home-section-heading"><h2>Hızlı işlemler</h2><span>Yönetici alanı</span></div><div class="home-actions"><button id="homeReport" type="button" class="btn home-primary"><span class="action-symbol" aria-hidden="true">+</span><span><b>Arıza bildir</b><small>Sorunu firmanıza iletin</small></span><span class="action-forward" aria-hidden="true">↗</span></button><button id="homeReports" type="button" class="home-row report-hub"><span class="row-icon">'+bell+'</span><span class="row-copy"><b>Bildirimlerim</b><small>'+reportSummary+'</small><small class="latest-status">'+reportHint+'</small></span><span class="row-arrow" aria-hidden="true">›</span></button><div class="home-quick-grid">'+(number?'<a class="home-row home-call" href="tel:'+esc(number)+'"><span class="row-icon">'+call+'</span><span class="row-copy"><b>Firmayı ara</b><small>'+esc(s.company||'Bakım firmanız')+'</small></span></a>':'<div class="home-row home-call"><span class="row-icon">'+call+'</span><span class="row-copy"><b>'+esc(s.company||'Bakım firmanız')+'</b><small>Telefon paylaşılmadı</small></span></div>')+'<button id="homeReceipts" type="button" class="home-row"><span class="row-icon">'+doc+'</span><span class="row-copy"><b>Makbuzlarım</b><small>Ödemeler ve PDF belgeler</small></span></button></div></div><details id="buildingInfo" class="building-info"'+(expanded?' open':'')+'><summary><span>Muayene bilgileri</span><span class="inspection-tag '+labelClass+'">'+esc(labelNames[rawLabel]||'Paylaşılmadı')+'</span></summary><div class="inspection-grid"><div><span>Muayene etiketi</span><b class="inspection-tag '+labelClass+'">'+esc(labelNames[rawLabel]||'Paylaşılmadı')+'</b></div><div><span>Sonraki muayene</span><b>'+esc(date(s.inspection_date))+'</b></div></div></details><div class="overview-foot"><button type="button" class="textbtn" id="overviewRefresh">Bilgileri yenile</button><span>v2.3.13</span></div>';
 $('homeReport').addEventListener('click',()=>$('reportOpen').click());$('homeReceipts').addEventListener('click',()=>switchView('receipts'));
 $('homeReports').addEventListener('click',()=>{if(reportsError){load();return;}reportFilter='all';visibleLimit=6;renderReports();switchView('reports');});
 $('overviewRefresh').addEventListener('click',load);switchView(view);
}

function resetReceipts(){closeReceiptPdf();receipts=[];receiptsReady=false;receiptsError='';receiptLimit=6;if($('receipts'))$('receipts').replaceChildren();}
const money=value=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(value)||0);
const receiptKind=r=>r.advance?'Erken tahsilat / avans':({bakim:'Bakım ödemesi',parca:'Parça / işlem ödemesi',cari:'Ödeme'})[r.kind]||'Ödeme';
async function loadReceipts(ticket=epoch){
 if(!current)return;const id=current.id;
 try{const list=await rpc('abr_mgr_receipt_list',{p_apartment:id});if(ticket!==epoch||!current||current.id!==id)return;receipts=Array.isArray(list)?list:[];receiptsReady=true;receiptsError='';renderReceipts();}
 catch(e){if(ticket!==epoch||!current||current.id!==id)return;receiptsReady=false;receiptsError=/PGRST202|does not exist|schema cache/.test(String(e.message||e))?'Makbuz paylaşımı henüz firmanız tarafından etkinleştirilmedi.':errorText(e);renderReceipts();}
}
function renderReceipts(){
 const host=$('receipts');host.replaceChildren();
 if(receiptsError||!receiptsReady){const box=document.createElement('div');box.className='empty';box.textContent=receiptsError||'Makbuzlar yükleniyor…';if(receiptsError){const retry=document.createElement('button');retry.type='button';retry.className='textbtn';retry.textContent='Yeniden dene';retry.addEventListener('click',()=>loadReceipts());box.appendChild(retry);}host.appendChild(box);return;}
 if(!receipts.length){host.innerHTML='<div class="empty"><b>Henüz makbuz paylaşılmadı</b><p>Firmanız tahsilatı kaydettiğinde makbuzunuz burada görünür.</p></div>';return;}
 receipts.slice(0,receiptLimit).forEach(item=>{const r=item.receipt||{},b=document.createElement('button');b.type='button';b.className='receipt-row';b.innerHTML='<span><b>'+esc(receiptKind(r))+'</b><small>'+esc(date(r.date))+'</small><span class="receipt-description">'+esc(r.description||'Ödeme kaydı')+'</span></span><span><b>'+esc(money(r.amount))+'</b><small>'+ (item.pdf_path?'PDF’yi aç ›':'PDF hazırlanıyor') +'</small></span>';b.addEventListener('click',()=>receiptDetail(item));host.appendChild(b);});
 if(receipts.length>receiptLimit){const b=document.createElement('button');b.type='button';b.className='load-more';b.textContent='Diğer '+(receipts.length-receiptLimit)+' makbuzu göster';b.addEventListener('click',()=>{receiptLimit+=6;renderReceipts();});host.appendChild(b);}
}
let pdfOpenEpoch=0,pdfTask=null,pdfRenderTask=null,pdfFile=null,pdfZoom=1,pdfItem=null,pdfLoading=false,pdfLastFocus=null;
function pdfWait(promise,ms=30000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('PDF zamanında yüklenemedi.')),ms);})]).finally(()=>clearTimeout(timer));}
function closeReceiptPdf(){
 pdfOpenEpoch++;pdfLoading=false;pdfItem=null;pdfFile=null;
 if(pdfRenderTask){try{pdfRenderTask.cancel();}catch(e){}pdfRenderTask=null;}
 if(pdfTask){try{Promise.resolve(pdfTask.destroy()).catch(()=>{});}catch(e){}pdfTask=null;}
 $('receiptPdfPages').replaceChildren();$('receiptPdfModal').hidden=true;$('receiptPdfShare').disabled=true;
 document.querySelector('.shell').inert=false;$('bottom').inert=false;
 if($('reportModal').hidden&&$('detailModal').hidden)document.body.style.overflow='';
 if(pdfLastFocus&&pdfLastFocus.isConnected)pdfLastFocus.focus();pdfLastFocus=null;
}
function receiptPdfZoom(value){
 pdfZoom=Math.min(3,Math.max(1,value));$('receiptPdfZoomValue').textContent=Math.round(pdfZoom*100)+'%';
 const width=Math.max(240,$('receiptPdfScroll').clientWidth-32);
 document.querySelectorAll('#receiptPdfPages canvas').forEach(canvas=>{canvas.style.width=Math.round(width*pdfZoom)+'px';canvas.style.height='auto';});
 $('receiptPdfZoomOut').disabled=pdfZoom<=1;$('receiptPdfZoomIn').disabled=pdfZoom>=3;
}
async function receiptDetail(item){
 if(!current||!user||!receipts.some(r=>r.id===item.id))return;
 closeReceiptPdf();pdfLastFocus=document.activeElement;pdfItem=item;pdfLoading=true;pdfZoom=1;
 const ticket=pdfOpenEpoch,apartmentId=current.id,userId=user.id;
 const active=()=>ticket===pdfOpenEpoch&&current?.id===apartmentId&&user?.id===userId;
 $('receiptPdfModal').hidden=false;document.body.style.overflow='hidden';document.querySelector('.shell').inert=true;$('bottom').inert=true;
 $('receiptPdfSubtitle').textContent=receiptKind(item.receipt||{})+' · '+date(item.receipt?.date);
 $('receiptPdfStatus').textContent='Makbuz yükleniyor…';$('receiptPdfStatus').hidden=false;$('receiptPdfRetry').hidden=true;$('receiptPdfShare').disabled=true;receiptPdfZoom(1);$('receiptPdfClose').focus();
 if(!item.pdf_path){$('receiptPdfStatus').textContent='PDF henüz paylaşılmadı. Firmanız makbuzları eşitledikten sonra burada görünür.';$('receiptPdfRetry').hidden=false;pdfLoading=false;return;}
 try{
  const [download,pdfjs]=await pdfWait(Promise.all([client.storage.from('manager-receipts').download(item.pdf_path),import('./makbuz-pdf.mjs?v=6.3.289')]));
  if(!active())return;if(download.error)throw download.error;
  const blob=download.data;if(!blob||blob.size<=0||blob.size>8388608)throw new Error('PDF dosyası geçersiz.');
  const bytes=new Uint8Array(await pdfWait(blob.arrayBuffer()));if(!active())return;
  if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('PDF dosyası geçersiz.');
  const file=new File([blob],'Odeme-Makbuzu-'+String(item.receipt?.date||'').replace(/[^0-9-]/g,'')+'.pdf',{type:'application/pdf'});
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('./makbuz-pdf.worker.mjs?v=6.3.289',location.href).href;
  const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,useWasm:false,isImageDecoderSupported:false});pdfTask=task;
  const pdf=await pdfWait(task.promise);if(!active())return;
  if(pdf.numPages<1||pdf.numPages>10)throw new Error('Makbuz sayfa sayısı geçersiz.');
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdfWait(pdf.getPage(n));if(!active())return;
   const base=page.getViewport({scale:1}),width=Math.max(240,$('receiptPdfScroll').clientWidth-32),viewport=page.getViewport({scale:width/base.width});
   const resolution=Math.min(2,Math.max(1,window.devicePixelRatio||1));
   const canvas=document.createElement('canvas');canvas.width=Math.floor(viewport.width*resolution);canvas.height=Math.floor(viewport.height*resolution);canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Ödeme makbuzu, sayfa '+n+'/'+pdf.numPages);canvas.style.width=Math.floor(viewport.width)+'px';canvas.style.height='auto';$('receiptPdfPages').appendChild(canvas);
   const render=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:resolution===1?null:[resolution,0,0,resolution,0,0]});pdfRenderTask=render;
   await pdfWait(render.promise);if(!active())return;pdfRenderTask=null;
  }
  pdfFile=file;$('receiptPdfStatus').hidden=true;$('receiptPdfShare').disabled=false;pdfLoading=false;receiptPdfZoom(1);
 }catch(e){if(!active())return;if(pdfRenderTask){try{pdfRenderTask.cancel();}catch(ignore){}pdfRenderTask=null;}if(pdfTask){try{Promise.resolve(pdfTask.destroy()).catch(()=>{});}catch(ignore){}pdfTask=null;}$('receiptPdfPages').replaceChildren();pdfFile=null;pdfLoading=false;$('receiptPdfStatus').hidden=false;$('receiptPdfStatus').textContent='Makbuz yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.';$('receiptPdfRetry').hidden=false;}
}
async function shareReceiptPdf(){
 const file=pdfFile,ticket=pdfOpenEpoch;if(!file)return;
 try{
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({files:[file],title:'Ödeme makbuzu'});return;}
  const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){if(ticket!==pdfOpenEpoch||e?.name==='AbortError')return;$('receiptPdfStatus').hidden=false;$('receiptPdfStatus').textContent='Paylaşım açılamadı. PDF paylaş düğmesine tekrar dokunun.';}
}
async function loadReports(ticket){
 if(!current)return;const id=current.id;
 try{const list=await rpc('abr_mgr_fault_list',{p_apartment:id});if(ticket!==epoch||!current||current.id!==id)return;reports=Array.isArray(list)?list:[];reportsReady=true;reportsError='';renderReports();renderOverview();}
 catch(e){if(ticket!==epoch||!current||current.id!==id)return;reportsReady=false;reportsError=errorText(e);renderReports();renderOverview();throw e;}
}
function renderReports(){
 const el=$('reports');el.replaceChildren();if($('reportCount'))$('reportCount').textContent='';
 document.querySelectorAll('[data-filter]').forEach(b=>{const active=b.dataset.filter===reportFilter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 if(reportsError){el.innerHTML='<div class="card empty">'+esc(reportsError)+'</div>';return;}
 if(!reportsReady){el.innerHTML='<div class="card empty">Bildirimler yükleniyor…</div>';return;}
 const list=reports.filter(r=>reportFilter==='all'||(reportFilter==='resolved'?r.status==='resolved':r.status!=='resolved'));
 if(!list.length){el.innerHTML='<div class="card empty"><b>'+ (reportFilter==='resolved'?'Tamamlanmış bildirim yok':reportFilter==='active'?'Açık bildirim yok':'Henüz bildirim yok')+'</b><p>Gönderdiğiniz arızaların durumunu burada takip edebilirsiniz.</p></div>';return;}
 if($('reportCount'))$('reportCount').textContent=list.length;
 const paths={door:'M6 3h12v18H6V3ZM12 3v18M9 12h.01M15 12h.01',stopped:'M12 3 2 21h20L12 3ZM12 9v5M12 17h.01',noise:'M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4',lighting:'M9 18h6M10 21h4M8 12a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z',other:'M5 4h14v16H5V4ZM9 8h6M9 12h6M9 16h3'};
 list.slice(0,visibleLimit).forEach(r=>{const b=document.createElement('button');b.type='button';b.className='report';const status=['new','seen','en_route','resolved'].includes(r.status)?r.status:'unknown';b.innerHTML='<span class="report-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="'+(paths[r.category]||paths.other)+'" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="report-content"><span class="report-heading"><b>'+esc(categories[r.category]||'Arıza bildirimi')+'</b><span class="pill status-'+status+'">'+esc(labels[r.status]||r.status)+'</span></span><span class="report-description">'+esc(r.description)+'</span><span class="report-meta"><time>'+esc(date(r.created_at,true))+'</time>'+((r.photos||[]).length?'<span class="photo-count">'+(r.photos||[]).length+' fotoğraf</span>':'')+'</span></span><span class="report-chevron" aria-hidden="true">›</span>';b.addEventListener('click',()=>detail(r));el.appendChild(b);});
 if(list.length>visibleLimit){const more=document.createElement('button');more.type='button';more.className='load-more';more.textContent='Diğer '+(list.length-visibleLimit)+' bildirimi göster';more.addEventListener('click',()=>{visibleLimit+=6;renderReports();});el.appendChild(more);}
}
function openModal(id){lastFocus=document.activeElement;$(id).hidden=false;document.body.style.overflow='hidden';$(id).querySelector('button').focus();}
function closeModal(id){if(!$(id))return;if(id==='detailModal')photoEpoch++;$(id).hidden=true;if($('reportModal').hidden&&$('detailModal').hidden&&$('receiptPdfModal').hidden){document.body.style.overflow='';if(lastFocus&&lastFocus.isConnected)lastFocus.focus();}}
async function detail(r){
 if(!current)return;const ap=current.id,ticket=epoch,photoTicket=++photoEpoch;
 openModal('detailModal');$('detailTitle').textContent=categories[r.category]||'Bildirim takibi';
 $('detailBody').innerHTML='<div class="detail-meta"><span class="pill '+(r.status==='resolved'?'resolved':'')+'">'+esc(labels[r.status]||r.status)+'</span><small>#'+esc(r.id.slice(0,8).toUpperCase())+' · '+esc(date(r.created_at,true))+'</small></div>'+progress(r)+'<h3>Bildiriminiz</h3><p class="detail-description">'+esc(r.description)+'</p>'+(r.public_note?'<div class="company-note"><span>Firmadan açıklama</span><p>'+esc(r.public_note)+'</p></div>':'<p class="muted">Firma bir açıklama paylaştığında burada görebilirsiniz.</p>')+'<h3>Fotoğraflar ('+(r.photos||[]).length+')</h3><div class="photos" id="detailPhotos">'+(!(r.photos||[]).length?'<p class="muted">Bu bildirime fotoğraf eklenmemiş.</p>':'')+'</div><h3>İşlem geçmişi</h3><ul class="timeline">'+(r.events||[]).map(e=>'<li><b>'+esc(labels[e.status]||e.status)+'</b>'+(e.note?'<p>'+esc(e.note)+'</p>':'')+'<time>'+esc(date(e.created_at,true))+'</time></li>').join('')+'</ul>';
 const valid=()=>ticket===epoch&&photoTicket===photoEpoch&&current&&current.id===ap&&!$('detailModal').hidden;
 for(const p of r.photos||[]){
  const tile=document.createElement('div');tile.className='photo-tile';$('detailPhotos').appendChild(tile);
  const loadPhoto=async()=>{tile.textContent='Fotoğraf yükleniyor…';try{
   const response=await client.storage.from('manager-photos').createSignedUrl(p.path,300);if(!valid())return;
   if(response.error)throw response.error;if(!response.data?.signedUrl)throw new Error('Fotoğraf bağlantısı alınamadı.');
   const url=response.data.signedUrl,b=document.createElement('button'),img=document.createElement('img'),caption=document.createElement('span');b.type='button';b.className='photo-thumb';img.alt='Gönderdiğiniz arıza fotoğrafı';img.loading='lazy';caption.textContent='Fotoğrafı büyüt';b.append(img,caption);b.addEventListener('click',()=>{$('photoImage').src=url;$('photoViewer').showModal();});img.addEventListener('error',()=>{if(valid())failed('Fotoğraf yüklenemedi.');},{once:true});tile.replaceChildren(b);img.src=url;
  }catch(e){if(valid())failed(errorText(e));}};
  const failed=text=>{tile.textContent=text;const retry=document.createElement('button');retry.type='button';retry.className='textbtn';retry.textContent='Yeniden dene';retry.addEventListener('click',loadPhoto);tile.appendChild(retry);};await loadPhoto();
 }
}
async function compress(file){if(!file||!/^image\//.test(file.type)||file.size>20*1024*1024)throw new Error('Fotoğraflar 20 MB’dan küçük olmalı.');const url=URL.createObjectURL(file);try{const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Fotoğraf okunamadı. JPEG veya PNG olarak tekrar seçin.'));image.src=url;});const ratio=Math.min(1,1600/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));if(!blob||blob.size>2097152)throw new Error('Fotoğraf küçültülemedi. Daha küçük bir fotoğraf seçin.');return blob;}finally{URL.revokeObjectURL(url);}}
async function submitFault(event){event.preventDefault();if(submitting||!current)return;if(navigator.onLine===false){message('faultError','İnternet bağlantısı gerekli. Yazdığınız açıklama bu ekran açıkken korunur.');return;}const ap=current.id,description=$('description').value.trim(),files=Array.from($('files').files);if(description.length<10||files.length>4){message('faultError','En az 10 karakter açıklama ve en fazla 4 fotoğraf ekleyin.');return;}submitting=true;$('faultSubmit').disabled=true;$('reportClose').disabled=true;message('faultError','');try{
 // Validate/decode all photos before creating the report. request UUID makes network retries safe.
 const blobs=await Promise.all(files.map(compress));requestId=requestId||uuid();savedFault=savedFault||await rpc('abr_mgr_submit_fault',{p_apartment:ap,p_description:description,p_category:$('category').value,p_priority:$('priority').value,p_request:requestId});
 if(!savedFault.notified){
  try{const response=await client.functions.invoke('notify-team',{body:{event:'manager_fault_created',manager_fault_id:savedFault.id,app_url:new URL('index.html',location.href).href}});if(response.error){let detail='';try{const info=await response.error.context.json();detail=info.error||info.message||'';}catch(ignore){}throw new Error(detail||response.error.message||'Bildirim isteği reddedildi.');}if(response.data?.ok!==true)throw new Error(response.data?.error||'Bildirim servisi isteği kabul etmedi.');savedFault.notified=true;notifyWarning=response.data?.message_id?'':'Arıza kaydedildi; telefon bildirimi için etkin alıcı bulunamadı.';}
  catch(e){notifyWarning='Arıza kaydedildi; telefon bildirimi gönderilemedi. Firma kayıt listesinden görebilir.';}
 }
 $('files').disabled=true;$('description').disabled=true;$('category').disabled=true;$('priority').disabled=true;
 if(!current||current.id!==ap)throw new Error('Apartman erişimi değişti.');
 for(let i=0;i<blobs.length;i++){if(savedFault.uploaded&&savedFault.uploaded.has(i))continue;const path=ap+'/'+savedFault.id+'/'+uuid()+'.jpg';const upload=await client.storage.from('manager-photos').upload(path,blobs[i],{contentType:'image/jpeg',upsert:false});if(upload.error)throw upload.error;try{await rpc('abr_mgr_attach_photo',{p_fault:savedFault.id,p_path:path});}catch(e){await client.storage.from('manager-photos').remove([path]);throw e;}if(!savedFault.uploaded)savedFault.uploaded=new Set();savedFault.uploaded.add(i);}
 savedFault=null;requestId=null;['files','description','category','priority'].forEach(id=>$(id).disabled=false);$('faultForm').reset();closeModal('reportModal');await load();if(notifyWarning)message('appError',notifyWarning,false);notifyWarning='';
 }catch(e){message('faultError',(savedFault?'Arıza kaydedildi; fotoğraf yüklemesi tamamlanamadı. Tekrar basınca yalnız eksik fotoğraflar denenir. ':'')+errorText(e)+(notifyWarning?' '+notifyWarning:''));}finally{submitting=false;$('faultSubmit').disabled=false;$('reportClose').disabled=false;}}
async function portalFetch(input,options){
 const controller=new AbortController(),original=options&&options.signal,abort=()=>controller.abort();
 if(original){if(original.aborted)abort();else original.addEventListener('abort',abort,{once:true});}
 const timer=setTimeout(abort,25000);try{return await fetch(input,Object.assign({},options,{signal:controller.signal}));}finally{clearTimeout(timer);if(original)original.removeEventListener('abort',abort);}
}
async function init(){if(!window.supabase){message('authError','Giriş bileşeni yüklenemedi. İnternetinizi kontrol edip sayfayı yenileyin.');$('authSubmit').disabled=true;return;}
 client=window.supabase.createClient('https://vfadlxuujqcpkckvwjbl.supabase.co','sb_publishable_QvEWbZy98j_kUKd7rPp0ew_e4J2GqKQ',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'abr-manager-auth-v1'},global:{fetch:portalFetch}});
 client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>{if(event==='PASSWORD_RECOVERY'){recovery=true;user=session&&session.user;$('auth').hidden=true;$('app').hidden=true;$('bottom').hidden=true;$('recovery').hidden=false;return;}if(!session){setAuth();return;}if(user&&user.id!==session.user.id)setAuth();user=session.user;if(!recovery)load();},0);});
 const session=await client.auth.getSession();if(session.error){message('authError',errorText(session.error));return;}if(session.data.session){user=session.data.session.user;await load();}
}
$('loginTab').addEventListener('click',()=>authMode(false));$('signupTab').addEventListener('click',()=>authMode(true));
$('authForm').addEventListener('submit',async e=>{e.preventDefault();if($('authSubmit').disabled)return;$('authSubmit').disabled=true;message('authError','');try{const email=$('email').value.trim(),password=$('password').value;const result=signup?await client.auth.signUp({email,password,options:{emailRedirectTo:new URL('yonetici.html',location.href).href}}):await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;$('password').value='';if(!result.data.session)message('authError','Doğrulama bağlantısı e-postanıza gönderildi. Adresinizi doğruladıktan sonra bu davet bağlantısından giriş yapın.',false);else{user=result.data.session.user;await load();}}catch(error){message('authError',errorText(error));}finally{$('authSubmit').disabled=false;}});
$('forgot').addEventListener('click',async()=>{const email=$('email').value.trim();if(!$('email').checkValidity()){message('authError','Önce e-posta adresinizi yazın.');return;}$('forgot').disabled=true;try{const r=await client.auth.resetPasswordForEmail(email,{redirectTo:new URL('yonetici.html',location.href).href});if(r.error)throw r.error;message('authError','Şifre yenileme bağlantısı e-postanıza gönderildi.',false);}catch(e){message('authError',errorText(e));}finally{$('forgot').disabled=false;}});
$('recoveryForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const r=await client.auth.updateUser({password:$('newPassword').value});if(r.error)throw r.error;recovery=false;$('newPassword').value='';await load();}catch(e){alert(errorText(e));}finally{button.disabled=false;}});
$('logout').addEventListener('click',async()=>{if(submitting)return;const r=await client.auth.signOut({scope:'local'});if(r.error){message('appError',errorText(r.error));return;}recovery=false;setAuth();});
$('refresh').addEventListener('click',load);$('receiptRefresh').addEventListener('click',()=>loadReceipts());$('apartmentSelect').addEventListener('change',async e=>{if(submitting)return;epoch++;if($('photoViewer').open)$('photoViewer').close();$('photoImage').removeAttribute('src');current=apartments.find(a=>a.id===e.target.value)||null;resetReceipts();reports=[];reportsReady=false;reportsError='';renderReports();savedFault=null;requestId=null;['files','description','category','priority'].forEach(id=>$(id).disabled=false);$('faultForm').reset();closeModal('reportModal');closeModal('detailModal');if(current){renderOverview();try{await Promise.allSettled([loadReports(epoch),loadReceipts(epoch)]);}catch(error){message('appError',errorText(error));}}});
$('reportOpen').addEventListener('click',()=>{if(!current)return;const p=phone(current.snapshot.phone);$('emergencyCall').removeAttribute('href');if(p)$('emergencyCall').href='tel:'+p;openModal('reportModal');});$('reportClose').addEventListener('click',()=>{if(!submitting)closeModal('reportModal');});$('detailClose').addEventListener('click',()=>closeModal('detailModal'));$('faultForm').addEventListener('submit',submitFault);
$('files').addEventListener('change',()=>{if(savedFault){message('faultError','Eksik fotoğraf gönderimini tamamlayana kadar seçili fotoğrafları değiştirmeyin.');return;}$('fileInfo').textContent=$('files').files.length+' fotoğraf seçildi · en fazla 4';});
window.addEventListener('online',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});setInterval(()=>{if(!submitting&&$('reportModal').hidden&&$('detailModal').hidden&&$('receiptPdfModal').hidden)load();},30000);
document.addEventListener('keydown',e=>{if($('photoViewer').open)return;const modal=!$('receiptPdfModal').hidden?$('receiptPdfModal'):!$('reportModal').hidden?$('reportModal'):!$('detailModal').hidden?$('detailModal'):null;if(!modal)return;if(e.key==='Escape'&&!submitting){if(modal.id==='receiptPdfModal')closeReceiptPdf();else closeModal(modal.id);return;}if(e.key==='Tab'){const items=Array.from(modal.querySelectorAll('button,input,select,textarea,a[href]')).filter(n=>!n.disabled);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{switchView(b.dataset.view);window.scrollTo(0,0);}));
 document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{reportFilter=b.dataset.filter;visibleLimit=6;renderReports();}));
 $('photoClose').addEventListener('click',()=>$('photoViewer').close());$('photoViewer').addEventListener('click',e=>{if(e.target===$('photoViewer'))$('photoViewer').close();});
 $('receiptPdfClose').addEventListener('click',closeReceiptPdf);$('receiptPdfShare').addEventListener('click',shareReceiptPdf);$('receiptPdfZoomOut').addEventListener('click',()=>receiptPdfZoom(pdfZoom-.5));$('receiptPdfZoomIn').addEventListener('click',()=>receiptPdfZoom(pdfZoom+.5));$('receiptPdfRetry').addEventListener('click',async()=>{if(pdfLoading||!pdfItem)return;const id=pdfItem.id,ticket=pdfOpenEpoch;await loadReceipts();if(ticket!==pdfOpenEpoch||$('receiptPdfModal').hidden)return;const item=receipts.find(r=>r.id===id);if(item)receiptDetail(item);});window.addEventListener('resize',()=>{if(!$('receiptPdfModal').hidden)receiptPdfZoom(pdfZoom);});
 init().catch(e=>message('authError',errorText(e)));
})();
