/* Sky viewer: image renderer, Object Lab controls, details card, sorted list, colour map. Needs data.js. */
const N=256,SZ=640,ASK=Math.asinh(14);
const S={T:TARGETS[0],lens:'all',band:8,mode:'normal',gain:0,thr:0,marks:true,e:0,playing:!reduced,speed:2.5,hint:false,cat:false,sel:null,fov:3,sort:'bright',
  classes:Object.fromEntries(CLS_KEYS.map(k=>[k,true]))};
const cv=$('#sky'),ctx=cv.getContext('2d');cv.width=cv.height=SZ;
const off=document.createElement('canvas');off.width=off.height=N;const octx=off.getContext('2d');
const frameCache=new Map(),noiseCache=new Map();
const invalidate=()=>frameCache.clear();

/* ---- physics-ish helpers ---- */
const curLam=()=>S.lens==='all'?null:bandLam(S.lens,S.band);
const noiseLevel=lam=>lam==null?.006:.014;
const thrVal=()=>.004*Math.pow(10,S.thr/100*2.1);
const gainF=()=>Math.pow(10,S.gain);
function fluxAt(s,e,lam){
  const sp=SPEC[s.type],v=s.vr?s.vr[e]:1;
  if(lam==null){let a=0;for(let i=0;i<6;i++)a+=sp(specMid(i));return s.b*v*a/6}
  return s.b*v*sp(lam);
}
const pos=(s,e)=>{const t=EY[e]-TMID;return[s.dx+s.pm[0]*t,s.dy+s.pm[1]*t]};
const toPx=(p,q)=>{const sc=S.fov*60/SZ;return[SZ/2-p/sc,SZ/2-q/sc]};
const matches=(s,e)=>S.classes[s.cls]&&(S.thr<=0||fluxAt(s,e,curLam())>=thrVal());
const detected=(s,e)=>fluxAt(s,e,curLam())>=3*noiseLevel(curLam());
function skyPos(s,e){const[p,q]=pos(s,e),T=S.T;return[T.ra0+p/(3600*Math.cos(T.dec0*Math.PI/180)),T.dec0+q/3600]}

/* ---- image synthesis ---- */
function noiseFor(e,ch){
  const key=[S.T.id,S.fov,e,ch].join('|');let a=noiseCache.get(key);
  if(a)return a;
  if(noiseCache.size>60)noiseCache.clear();
  const r=mulberry(hashStr(key)),n=new Float32Array(N*N);
  for(let i=0;i<n.length;i++)n[i]=gauss(r);
  noiseCache.set(key,n);return n;
}
function render(e,lam,ch){
  const key=e+'|'+lam+'|'+ch;let img=frameCache.get(key);
  if(img)return img;
  const nz=noiseFor(e,ch),lv=noiseLevel(lam);img=new Float32Array(N*N);
  for(let i=0;i<img.length;i++)img[i]=nz[i]*lv;
  const sc=S.fov*60/N,sig=Math.max(1,2.7/sc);
  for(const s of S.T.srcs){
    let a=fluxAt(s,e,lam);if(!matches(s,e))a*=.12;
    const ext=s.ext||1;if(ext>1)a/=ext*.8;
    if(a<.0006)continue;
    const sg=sig*ext,[p,q]=pos(s,e),x=N/2-p/sc,y=N/2-q/sc,rad=Math.ceil(4*sg);
    if(x<-rad||x>N+rad||y<-rad||y>N+rad)continue;
    const x0=Math.max(0,Math.floor(x-rad)),x1=Math.min(N-1,Math.ceil(x+rad)),y0=Math.max(0,Math.floor(y-rad)),y1=Math.min(N-1,Math.ceil(y+rad)),k=1/(2*sg*sg);
    for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++){const dx=i+.5-x,dy=j+.5-y;img[j*N+i]+=a*Math.exp(-(dx*dx+dy*dy)*k)}
  }
  frameCache.set(key,img);return img;
}
const COLOR_LAMS=[4.7,2.9,1.25];
function paint(){
  const e=S.e,im=octx.createImageData(N,N),d=im.data,G=gainF()*14,lam=curLam();
  const st=v=>Math.min(1,Math.max(0,Math.asinh(Math.max(0,v)*G)/ASK));
  if(S.mode==='color'){
    const fr=render(e,COLOR_LAMS[0],1),fg=render(e,COLOR_LAMS[1],2),fb=render(e,COLOR_LAMS[2],3);
    for(let i=0;i<N*N;i++){const o=i*4,r=st(fr[i]),g2=st(fg[i]),b=st(fb[i]),w=Math.max(0,Math.min(r,g2,b)-.6)*.8;
      d[o]=6+249*r+60*w;d[o+1]=9+246*g2+60*w;d[o+2]=18+237*b+60*w;d[o+3]=255}
  }else if(S.mode==='diff'){
    const f=render(e,lam,0),f0=render(0,lam,0),k=gainF()/.35;
    for(let i=0;i<N*N;i++){const x=Math.max(-1,Math.min(1,(f[i]-f0[i])*k)),a=Math.abs(x),o=i*4;
      if(x>=0){d[o]=6+249*a;d[o+1]=9+129*a;d[o+2]=18+58*a}else{d[o]=6+108*a;d[o+1]=9+205*a;d[o+2]=18+237*a}d[o+3]=255}
  }else{
    const tint=S.lens==='all'?[226,233,255]:TINT[S.lens];let src;
    if(S.mode==='trail'){const th=lam==null?.022:.045,m=new Float32Array(N*N);
      for(let k=0;k<=e;k++){const q=render(k,lam,0);for(let i=0;i<m.length;i++){const v=q[i]-th;if(v>m[i])m[i]=v}}src=m}
    else src=render(e,lam,0);
    for(let i=0;i<N*N;i++){const t=st(src[i]),w=Math.max(0,t-.72)*3.2,o=i*4;
      d[o]=6+(tint[0]-6)*t+127*w;d[o+1]=9+(tint[1]-9)*t+127*w;d[o+2]=18+(tint[2]-18)*t+127*w;d[o+3]=255}
  }
  octx.putImageData(im,0,0);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(off,0,0,SZ,SZ);
  overlays();meta();updateDetails();updateList();drawMap();
}
function bracket(x,y,col){const k=17,l=7;ctx.strokeStyle=col;ctx.lineWidth=1.8;ctx.beginPath();[[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([a,b])=>{ctx.moveTo(x+a*k,y+b*(k-l));ctx.lineTo(x+a*k,y+b*k);ctx.lineTo(x+a*(k-l),y+b*k)});ctx.stroke()}
function overlays(){
  const T=S.T,F=S.fov*60,e=S.e,lam=curLam(),gf=gainF();
  ctx.font='500 12px "JetBrains Mono",monospace';
  if(S.marks){
    ctx.lineWidth=1.3;
    for(const s of T.srcs){
      if(!matches(s,e)||fluxAt(s,e,lam)*gf<.04)continue;
      const[x,y]=toPx(...pos(s,e));if(x<4||y<4||x>SZ-4||y>SZ-4)continue;
      ctx.strokeStyle=CLASSES[s.cls].col;ctx.globalAlpha=.85;ctx.beginPath();ctx.arc(x,y,s.ext?16:10,0,TAU);ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  if(S.cat){
    ctx.strokeStyle='#72d6ff';ctx.fillStyle='#72d6ff';ctx.lineWidth=1.5;
    for(const s of T.srcs){if(!(s.main||s.cat))continue;const t=2016-TMID,[x,y]=toPx(s.dx+s.pm[0]*t,s.dy+s.pm[1]*t);
      if(x<0||y<0||x>SZ||y>SZ)continue;ctx.strokeRect(x-9,y-9,18,18);ctx.fillText('Gaia 2016',x+12,y-10)}
  }
  if(S.hint){
    ctx.strokeStyle='#ff8a4c';ctx.fillStyle='#ffb98f';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);
    for(const s of T.srcs){if(!s.main)continue;const[x,y]=toPx(...pos(s,e));if(x<0||y<0||x>SZ||y>SZ)continue;
      ctx.beginPath();ctx.arc(x,y,26,0,TAU);ctx.stroke();ctx.fillText(s.n.split(' (')[0],Math.min(x+30,SZ-160),y-30)}
    ctx.setLineDash([]);
  }
  const s=S.sel;
  if(s){const[x,y]=toPx(...pos(s,e));if(x>0&&y>0&&x<SZ&&y<SZ){bracket(x,y,'#fff');
    ctx.fillStyle='#fff';ctx.font='600 13px Inter,sans-serif';const nm=s.n.length>26?s.n.slice(0,26)+'…':s.n;ctx.textAlign=x>SZ-190?'right':'left';ctx.fillText(nm,x+(x>SZ-190?-22:22),y-20);ctx.textAlign='left'}}
  const opts=[[10,'10″'],[30,'30″'],[60,'1′'],[120,'2′'],[300,'5′'],[600,'10′']];
  let ch=opts[0];for(const o of opts)if(o[0]/F*SZ<=170)ch=o;
  const L=ch[0]/F*SZ,bx=SZ-16-L,by=SZ-18;ctx.font='500 12px "JetBrains Mono",monospace';
  ctx.strokeStyle='#e9eefc';ctx.fillStyle='#e9eefc';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+L,by);ctx.moveTo(bx,by-5);ctx.lineTo(bx,by+5);ctx.moveTo(bx+L,by-5);ctx.lineTo(bx+L,by+5);ctx.stroke();
  ctx.textAlign='center';ctx.fillText(ch[1],bx+L/2,by-9);ctx.textAlign='left';
  const cx=SZ-44,cy=48;ctx.strokeStyle='#98a4c6';ctx.fillStyle='#98a4c6';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx,cy-24);ctx.moveTo(cx,cy);ctx.lineTo(cx-24,cy);ctx.stroke();
  ctx.fillText('N',cx-4,cy-30);ctx.fillText('E',cx-42,cy+4);
}
function meta(){
  const e=S.e,r=mulberry(hashStr(S.T.id+e+'f'))(),flag=r<.12?['Cosmic-ray hit','warn']:r<.2?['Bright-star glare nearby','warn']:['Clean','ok'];
  const lens=S.mode==='color'?'Colour mix: 4.7, 2.9 and 1.25 µm as red, green, blue':S.lens==='all'?'All 6 lenses added together':`Lens ${S.lens+1} · band ${S.lens*17+S.band+1} of 102 · ${curLam().toFixed(2)} µm`;
  $('#meta').innerHTML=`<span>${EPOCHS[e]}</span><span>${lens}</span><span class="${flag[1]}">Quality: ${flag[0]}</span>`;
  $('#badge').textContent=`Picture ${e+1} of ${NE}`;
  $('#frame').value=e;
}

/* ---- details card ---- */
const dirName=a=>['north','north-east','east','south-east','south','south-west','west','north-west'][Math.round(a/45)%8];
const fmtDist=s=>s.dist==null?'Not listed':s.bg?`about ${s.dist.toLocaleString()} light-years (simulated)`:`${s.dist>100?'about ':''}${s.dist.toLocaleString()} light-years`;
let detSig='';
function colourWord(c){return c<-.9?'very blue':c<-.5?'blue':c<-.15?'slightly blue':c<.2?'neutral':c<.8?'red':'very red'}
function updateDetails(force){
  const s=S.sel,empty=$('#dEmpty'),body=$('#dBody');
  if(!s){empty.hidden=false;body.hidden=true;detSig='';return}
  const sig=[s.id,S.e,S.lens,S.band,S.mode].join('|');
  if(sig===detSig&&!force)return;detSig=sig;
  empty.hidden=true;body.hidden=false;
  const k=KINDS[s.type],e=S.e,lam=curLam(),[ra,dec]=skyPos(s,e),fx=fluxAt(s,e,lam),sn=Math.round(fx/noiseLevel(lam));
  const mu=Math.hypot(s.pm[0],s.pm[1]),pa=(Math.atan2(s.pm[0],s.pm[1])*180/Math.PI+360)%360,ci=colorIndex(s);
  let varTxt='Steady across all pictures';
  if(s.vr){const mn=Math.min(...s.vr),mx=Math.max(...s.vr);varTxt=`Varies by ${Math.round((1-mn/mx)*100)}% across the ${NE} pictures`}
  const rows=[
    ['Name',s.n],
    ...(s.id!==s.n?[['Designation',s.id]]:[]),
    ['Type',s.sp||k.title],
    ['Right ascension',fmtRA(ra,2)],
    ['Declination',fmtDec(dec)],
    ['Degrees',`${ra.toFixed(5)}°, ${dec.toFixed(5)}°`],
    ['Motion',mu<.05?'No measurable motion':`${mu.toFixed(2)}″ per year, toward ${dirName(pa)}`],
    ['Distance',fmtDist(s)],
    ['Brightness in this view',lam==null?`${fx.toFixed(3)} units · S/N ${sn} (all lenses added)`:`${fx.toFixed(3)} units · S/N ${sn} at ${lam.toFixed(2)} µm`],
    ['Colour',`${colourWord(ci)} (${ci>=0?'+':''}${ci.toFixed(2)})`],
    ['Variability',varTxt],
    ['Seen in',`Picture ${e+1} of ${NE}, ${EPOCHS[e]}`]
  ];
  $('#facts').innerHTML=rows.map(r=>`<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('');
  $('#dName').textContent=s.n;
  const pill=$('#dPill');pill.textContent=CLASSES[s.cls].label;pill.style.setProperty('--c',CLASSES[s.cls].col);
  $('#dSim').hidden=!s.bg;
  $('#dDesc').textContent=(s.note?s.note+' ':'')+k.text;
  $('#dLook').textContent=k.look;
  $('#dOnly').textContent=onlyClass(s.cls)?'Show all types again':`Show only ${CLASSES[s.cls].label.toLowerCase()}`;
  drawSpec();
}
const onlyClass=c=>CLS_KEYS.every(k=>S.classes[k]===(k===c));
function copyDetails(){
  const s=S.sel;if(!s)return;
  const txt=$$('#facts div').map(d=>d.firstChild.textContent+': '+d.lastChild.textContent).join('\n');
  navigator.clipboard.writeText(txt).then(()=>{$('#dMsg').textContent='Copied.'},()=>{$('#dMsg').textContent='Select the facts above and copy them.'});
}
/* spectrum */
const sc=$('#spec'),sx=sc.getContext('2d');
function drawSpec(){
  const s=S.sel;if(!s)return;
  const W=sc.width,H=sc.height,L=56,Rr=14,Tp=20,Bt=48;sx.clearRect(0,0,W,H);
  const r=mulberry(hashStr(s.id+S.e)),pts=[];let mx=.05;
  for(let i=0;i<102;i++){const a=Math.floor(i/17),j=i%17,l=bandLam(a,j),v=Math.max(0,s.b*(s.vr?s.vr[S.e]:1)*SPEC[s.type](l)+gauss(r)*.012);pts.push([l,v,a]);mx=Math.max(mx,v)}
  mx*=1.15;
  const X=l=>L+(l-.7)/(5.05-.7)*(W-L-Rr),Y=v=>H-Bt-(v/mx)*(H-Bt-Tp);
  if(S.lens!=='all'){sx.fillStyle='rgba(255,255,255,.08)';sx.fillRect(X(BANDS[S.lens][0]),Tp,X(BANDS[S.lens][1])-X(BANDS[S.lens][0]),H-Bt-Tp);
    sx.strokeStyle='#fff';sx.lineWidth=1.5;const lx=X(curLam());sx.beginPath();sx.moveTo(lx,Tp);sx.lineTo(lx,H-Bt);sx.stroke()}
  sx.strokeStyle='rgba(160,180,255,.17)';sx.fillStyle='#98a4c6';sx.lineWidth=1;sx.font='500 15px "JetBrains Mono",monospace';sx.textAlign='center';
  for(let l=1;l<=5;l++){sx.beginPath();sx.moveTo(X(l),Tp);sx.lineTo(X(l),H-Bt);sx.stroke();sx.fillText(l,X(l),H-Bt+20)}
  sx.fillText('Wavelength (µm)',(L+W-Rr)/2,H-8);
  sx.beginPath();sx.moveTo(L,Tp);sx.lineTo(L,H-Bt);sx.lineTo(W-Rr,H-Bt);sx.stroke();
  sx.save();sx.translate(14,(Tp+H-Bt)/2);sx.rotate(-Math.PI/2);sx.fillText('Brightness',0,0);sx.restore();
  sx.strokeStyle='rgba(233,238,252,.35)';sx.beginPath();pts.forEach((p,i)=>i?sx.lineTo(X(p[0]),Y(p[1])):sx.moveTo(X(p[0]),Y(p[1])));sx.stroke();
  pts.forEach(p=>{sx.fillStyle=`rgb(${TINT[p[2]]})`;sx.beginPath();sx.arc(X(p[0]),Y(p[1]),3.4,0,TAU);sx.fill()});
}

/* ---- sorted list ---- */
const SORTS={bright:{lab:'Brightest',val:(s,e)=>fluxAt(s,e,curLam()),show:v=>v.toFixed(2)+' u'},
  red:{lab:'Reddest',val:s=>colorIndex(s),show:v=>(v>=0?'+':'')+v.toFixed(2)},
  blue:{lab:'Bluest',val:s=>-colorIndex(s),show:v=>(v<=0?'+':'')+(-v).toFixed(2)},
  fast:{lab:'Fastest',val:s=>Math.hypot(s.pm[0],s.pm[1]),show:v=>v.toFixed(2)+'″/yr'}};
let listSig='';
function updateList(force){
  const e=S.e,K=SORTS[S.sort],vis=S.T.srcs.filter(s=>matches(s,e)&&detected(s,e));
  const top=vis.map(s=>[s,K.val(s,e)]).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const sig=top.map(t=>t[0].id).join(',')+'|'+S.sort+'|'+(S.sel?S.sel.id:'')+'|'+vis.length;
  if(sig===listSig&&!force)return;listSig=sig;
  $('#listInfo').textContent=`${vis.length} of ${S.T.srcs.length} objects match and are detected. Top ${top.length} by ${K.lab.toLowerCase()}:`;
  $('#list').innerHTML=top.length?top.map(([s,v])=>`<button type="button" class="li${S.sel===s?' on':''}" data-id="${s.id}"><span class="dot" style="background:${CLASSES[s.cls].col}"></span><span class="nm">${s.n}</span><span class="v">${K.show(v)}</span></button>`).join(''):'<p class="hint">Nothing matches. Turn on more object types or lower the brightness cut.</p>';
}

/* ---- colour-brightness map ---- */
const map=$('#cmap'),mx2=map.getContext('2d');let mapPts=[];
const MX=[-1.4,2.0],MY=[-2.8,.15];
function drawMap(){
  const W=map.width,H=map.height,L=52,Rr=12,Tp=12,Bt=46,e=S.e,lam=curLam();
  mx2.clearRect(0,0,W,H);
  const X=c=>L+(c-MX[0])/(MX[1]-MX[0])*(W-L-Rr),Y=v=>H-Bt-(Math.log10(v+.0015)-MY[0])/(MY[1]-MY[0])*(H-Bt-Tp);
  mx2.strokeStyle='rgba(160,180,255,.17)';mx2.fillStyle='#98a4c6';mx2.font='500 14px "JetBrains Mono",monospace';mx2.lineWidth=1;mx2.textAlign='center';
  for(const c of[-1,0,1,2]){mx2.beginPath();mx2.moveTo(X(c),Tp);mx2.lineTo(X(c),H-Bt);mx2.stroke()}
  mx2.fillText('bluer',L+34,H-Bt+22);mx2.fillText('redder',W-Rr-38,H-Bt+22);mx2.fillText('Colour',(L+W-Rr)/2,H-8);
  mx2.beginPath();mx2.moveTo(L,Tp);mx2.lineTo(L,H-Bt);mx2.lineTo(W-Rr,H-Bt);mx2.stroke();
  mx2.save();mx2.translate(14,(Tp+H-Bt)/2);mx2.rotate(-Math.PI/2);mx2.fillText('Brightness (log)',0,0);mx2.restore();
  const thr=3*noiseLevel(lam);mx2.setLineDash([4,4]);mx2.strokeStyle='rgba(255,209,102,.5)';mx2.beginPath();mx2.moveTo(L,Y(thr));mx2.lineTo(W-Rr,Y(thr));mx2.stroke();mx2.setLineDash([]);
  mx2.fillStyle='rgba(255,209,102,.8)';mx2.textAlign='left';mx2.font='500 12px "JetBrains Mono",monospace';mx2.fillText('detection limit',L+6,Y(thr)-5);
  mapPts=[];
  const draw=(m)=>{for(const s of S.T.srcs){const on=matches(s,e);if(on!==m)continue;const f=fluxAt(s,e,lam),x=X(colorIndex(s)),y=Y(f);if(y>H-Bt||y<Tp)continue;
    mx2.globalAlpha=on?.9:.15;mx2.fillStyle=CLASSES[s.cls].col;mx2.beginPath();mx2.arc(x,y,s.main?5.5:3.2,0,TAU);mx2.fill();if(on)mapPts.push([x,y,s])}};
  draw(false);draw(true);mx2.globalAlpha=1;
  if(S.sel){const s=S.sel,x=X(colorIndex(s)),y=Y(fluxAt(s,e,lam));mx2.strokeStyle='#fff';mx2.lineWidth=2;mx2.beginPath();mx2.arc(x,y,9,0,TAU);mx2.stroke()}
}
map.addEventListener('click',ev=>{
  const b=map.getBoundingClientRect(),x=(ev.clientX-b.left)/b.width*map.width,y=(ev.clientY-b.top)/b.height*map.height;
  let best=null,bd=18*18;for(const[px,py,s] of mapPts){const d=(px-x)**2+(py-y)**2;if(d<bd){bd=d;best=s}}
  if(best){S.sel=best;paint()}
});

/* ---- controls ---- */
function syncUI(){
  $('#fov').value=S.fov;$('#fovout').textContent=`${S.fov}′ wide`;
  $$('#lensSw .sw').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.a==String(S.lens))));
  const all=S.lens==='all',band=$('#band');band.disabled=all;band.value=S.band;
  if(all){$('#bandout').textContent='All 102 bands added';$('#lensHint').textContent='All six lenses added together give the cleanest picture. Pick one lens to isolate a colour.';$('#specmark').style.display='none'}
  else{const n=S.lens*17+S.band+1,l=curLam();$('#bandout').textContent=`Band ${n} of 102 · ${l.toFixed(2)} µm`;$('#lensHint').textContent=`Lens ${S.lens+1}, ${BANDS[S.lens][0]}–${BANDS[S.lens][1]} µm. ${LENS_TXT[S.lens]}`;
    const m=$('#specmark');m.style.display='';m.style.left=((l-.75)/(5-.75)*100)+'%'}
  $$('#modes button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.m===S.mode)));
  $('#modehint').textContent={normal:'One colour of light at a time, shown as a flipbook.',color:'Three infrared colours mixed into red, green and blue. Blue objects are hot stars, red ones are cold.',diff:'Orange is new light, blue is light that left since picture 1. Movers show as an orange and blue pair.',trail:'Adds up every picture so far. A mover leaves a row of dots behind it.'}[S.mode];
  $('#gainout').textContent=`×${gainF().toFixed(1)}`;
  $('#throut').textContent=S.thr<=0?'Show all':`Brighter than ${thrVal().toFixed(3)}`;
  $('#marks').checked=S.marks;
  $$('#classes .chip').forEach(b=>{b.setAttribute('aria-pressed',String(S.classes[b.dataset.k]));b.querySelector('.n').textContent=S.T.srcs.filter(s=>s.cls===b.dataset.k).length});
  $$('#sortSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.s===S.sort)));
  $$('#presets .chip').forEach(b=>b.setAttribute('aria-pressed','false'));
  $('#speedout').textContent=`${S.speed} pictures/s`;
}
function change(redo){invalidate();syncUI();paint();if(redo)drawSpec()}
const PRESETS={
  bd:{label:'Find brown dwarfs',lens:5,band:8,mode:'normal',gain:.6,thr:0,only:'bd',msg:'Lens 6 favours very cold objects. Brown dwarfs stay bright while stars fade.'},
  mover:{label:'Find movers',lens:'all',band:8,mode:'diff',gain:.2,thr:0,only:null,fov:6,msg:'Spot change shows orange and blue pairs where something moved.'},
  rainbow:{label:'Rainbow view',lens:'all',band:8,mode:'color',gain:.15,thr:0,only:null,msg:'Blue is hot, red is cold. Brown dwarfs and quasars glow red.'},
  vari:{label:'Find variable stars',lens:2,band:8,mode:'diff',gain:.2,thr:0,only:['giant','young'],msg:'Giants and young stars change brightness, so they flicker in Spot change.'},
  reset:{label:'Reset',lens:'all',band:8,mode:'normal',gain:0,thr:0,only:null,msg:''}
};
function applyPreset(k){
  const p=PRESETS[k];
  S.lens=p.lens;S.band=p.band;S.mode=p.mode;S.gain=p.gain;S.thr=p.thr;
  CLS_KEYS.forEach(c=>S.classes[c]=p.only==null?true:[].concat(p.only).includes(c));
  if(p.fov)S.fov=p.fov;
  $('#presetMsg').textContent=p.msg;
  change(true);
  const b=$(`#presets [data-p="${k}"]`);if(b)b.setAttribute('aria-pressed','true');
}
function buildUI(){
  const tw=$('#targets');
  TARGETS.forEach(T=>{const b=document.createElement('button');b.className='chip';b.dataset.id=T.id;b.innerHTML=`<span class="dot"></span>${T.name}`;b.setAttribute('aria-pressed','false');b.onclick=()=>setTarget(T,true);tw.appendChild(b)});
  const ps=$('#presets');Object.entries(PRESETS).forEach(([k,p])=>{const b=document.createElement('button');b.className='chip';b.dataset.p=k;b.textContent=p.label;b.setAttribute('aria-pressed','false');b.onclick=()=>applyPreset(k);ps.appendChild(b)});
  const cw=$('#lensSw');
  {const a=document.createElement('button');a.className='sw all';a.textContent='All';a.dataset.a='all';a.title='All six lenses added together';cw.appendChild(a);
   for(let i=0;i<6;i++){const b=document.createElement('button');b.className='sw';b.style.background=`rgb(${TINT[i]})`;b.textContent=i+1;b.dataset.a=i;b.title=`Lens ${i+1}: ${BANDS[i][0]}–${BANDS[i][1]} µm`;cw.appendChild(b)}}
  cw.onclick=e=>{const b=e.target.closest('.sw');if(!b)return;S.lens=b.dataset.a==='all'?'all':+b.dataset.a;change(true)};
  const cl=$('#classes');
  CLS_KEYS.forEach(k=>{const b=document.createElement('button');b.className='chip';b.dataset.k=k;b.setAttribute('aria-pressed','true');b.innerHTML=`<span class="dot" style="background:${CLASSES[k].col}"></span>${CLASSES[k].label}<span class="n"></span>`;
    b.onclick=()=>{S.classes[k]=!S.classes[k];change()};cl.appendChild(b)});
  $('#classAll').onclick=()=>{CLS_KEYS.forEach(k=>S.classes[k]=true);change()};
  $('#band').oninput=e=>{S.band=+e.target.value;change(true)};
  $('#modes').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.mode=b.dataset.m;change()};
  $('#gain').oninput=e=>{S.gain=+e.target.value;syncUI();paint()};
  $('#thr').oninput=e=>{S.thr=+e.target.value;change()};
  $('#marks').onchange=e=>{S.marks=e.target.checked;paint()};
  $('#fov').oninput=e=>{S.fov=+e.target.value;change()};
  $('#frame').oninput=e=>{S.playing=false;S.e=+e.target.value;setPlayIcon();paint()};
  $('#speed').oninput=e=>{S.speed=+e.target.value;syncUI()};
  $('#cat').onchange=e=>{S.cat=e.target.checked;paint()};
  $('#hintbtn').onclick=e=>{S.hint=!S.hint;e.currentTarget.setAttribute('aria-pressed',String(S.hint));e.currentTarget.textContent=S.hint?'Hide the hint':'Show me the mover';paint()};
  $('#play').onclick=()=>{S.playing=!S.playing;setPlayIcon()};
  $('#sortSeg').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.sort=b.dataset.s;syncUI();updateList(true)};
  $('#list').onclick=e=>{const b=e.target.closest('.li');if(!b)return;const s=S.T.srcs.find(x=>x.id===b.dataset.id);if(s){S.sel=s;paint()}};
  $('#dOnly').onclick=()=>{const s=S.sel;if(!s)return;if(onlyClass(s.cls))CLS_KEYS.forEach(k=>S.classes[k]=true);else CLS_KEYS.forEach(k=>S.classes[k]=k===s.cls);change();updateDetails(true)};
  $('#dCopy').onclick=copyDetails;
  $('#d0').textContent=EPOCHS[0];$('#d1').textContent=EPOCHS[NE-1];
  $('#coordform').onsubmit=ev=>{ev.preventDefault();go(parseRA($('#ra').value),parseDec($('#dec').value))};
  $('#random').onclick=()=>go(Math.random()*360,Math.asin(Math.random()*2-1)*180/Math.PI,'A random patch. Zoom out, pick Spot change, and find the mover.');
  $('#copy').onclick=async()=>{const T=S.T,txt=`${T.name}: RA ${fmtRA(T.ra0)}, Dec ${fmtDec(T.dec0)}`+(T.custom?'':` (open the page with #${T.id})`);
    try{await navigator.clipboard.writeText(txt);$('#copymsg').textContent='Copied.'}catch(_){$('#copymsg').textContent=txt}};
}
function setPlayIcon(){$('#playicon').innerHTML=S.playing?'<rect x="4" y="3" width="4" height="14" rx="1" fill="currentColor"/><rect x="12" y="3" width="4" height="14" rx="1" fill="currentColor"/>':'<path d="M5 3l12 7-12 7z" fill="currentColor"/>'}
function setTarget(T,push){
  S.T=T;S.fov=T.fov||3;S.e=0;S.sel=T.srcs.find(q=>q.main)||null;invalidate();listSig='';detSig='';
  $('#tip').innerHTML=T.tip;
  $('#ra').value=T.custom?fmtRA(T.ra0):T.ra;$('#dec').value=T.custom?fmtDec(T.dec0):T.dec;
  $$('#targets .chip').forEach(c=>c.setAttribute('aria-pressed',String(c.dataset.id===T.id)));
  if(push&&!T.custom)try{history.replaceState(null,'','#'+T.id)}catch(_){}
  syncUI();paint();
  if(window.gsap&&!reduced)gsap.fromTo('.stage',{opacity:.35,scale:.985},{opacity:1,scale:1,duration:.5,ease:'power2.out'});
}
function go(ra,dec,msg){
  if(isNaN(ra)||isNaN(dec)||dec<-90||dec>90){$('#coordmsg').textContent='Could not read those coordinates. Try 08h55m10.8s and -7d14m42s, or plain degrees.';return}
  const known=TARGETS.find(T=>Math.abs(T.ra0-ra)<.0006&&Math.abs(T.dec0-dec)<.0006);
  $('#coordmsg').textContent=msg||'Showing a simulated patch with one hidden mover.';
  setTarget(known||makeCustom(((ra%360)+360)%360,dec),true);
}
/* ---- pointer on the picture ---- */
function nearest(mx,my,r){
  let best=null,bd=r*r;
  for(const s of S.T.srcs){const on=matches(s,S.e);if(!on&&fluxAt(s,S.e,curLam())<.05)continue;if(fluxAt(s,S.e,curLam())*gainF()<.012)continue;
    const[x,y]=toPx(...pos(s,S.e)),d=(x-mx)**2+(y-my)**2+(on?0:400);if(d<bd){bd=d;best=s}}
  return best;
}
const IDLE='Move over the picture to read the sky position. Click any object to see its details.';
cv.addEventListener('pointermove',ev=>{
  const b=cv.getBoundingClientRect(),px=(ev.clientX-b.left)/b.width,py=(ev.clientY-b.top)/b.height,F=S.fov*60,T=S.T;
  const east=-(px-.5)*F,north=-(py-.5)*F,h=nearest(px*SZ,py*SZ,22);
  cv.style.cursor=h?'pointer':'crosshair';
  $('#readout').textContent=`RA ${fmtRA(T.ra0+east/(3600*Math.cos(T.dec0*Math.PI/180)))}  Dec ${fmtDec(T.dec0+north/3600)}`+(h?`  ·  ${h.n}`:'');
});
cv.addEventListener('pointerleave',()=>{$('#readout').textContent=IDLE});
cv.addEventListener('click',ev=>{
  const b=cv.getBoundingClientRect(),h=nearest((ev.clientX-b.left)/b.width*SZ,(ev.clientY-b.top)/b.height*SZ,34);
  if(h){S.sel=h;paint();if(window.gsap&&!reduced)gsap.fromTo('#details',{boxShadow:'0 0 0 2px rgba(255,138,76,.9)'},{boxShadow:'0 0 0 0px rgba(255,138,76,0)',duration:.9})}
});
/* ---- player loop ---- */
let last=performance.now(),acc=0;
function tick(t){
  const dt=Math.min(.25,(t-last)/1000);last=t;
  if(S.playing&&!document.body.classList.contains('tour')){acc+=dt;if(acc>1/S.speed){acc=0;S.e=(S.e+1)%NE;paint()}}
  requestAnimationFrame(tick);
}
function initViewer(){
  buildUI();
  const h=location.hash.slice(1),T=TARGETS.find(x=>x.id===h)||TARGETS[0];
  setPlayIcon();setTarget(T,false);requestAnimationFrame(tick);
}
