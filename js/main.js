/* Entry point: smooth scrolling, view switching, hash routes, intro animation. Loads last. */
/* Entrance animation that always ends fully visible, even if it is restarted mid-way */
function reveal(sel,y,dur,stag,delay){gsap.fromTo(sel,{y:y,opacity:0},{y:0,opacity:1,duration:dur,stagger:stag,delay:delay,ease:'power3.out',overwrite:true,clearProps:'transform,opacity'})}
let lenis=null;
if(window.Lenis&&!reduced){try{lenis=new Lenis({lerp:.09});document.documentElement.style.scrollBehavior='auto';(function lp(t){lenis.raf(t);requestAnimationFrame(lp)})(performance.now())}catch(_){lenis=null}}
/* ---------- view switching + hash routes (#sky names only) ---------- */
function setView(v,updHash){
  const tour=v==='tour';
  document.body.classList.toggle('tour',tour);
  $('#tab-viewer').setAttribute('aria-selected',String(!tour));
  $('#tab-tour').setAttribute('aria-selected',String(tour));
  $('#labels').hidden=!tour;
  if(space.setTour)space.setTour(tour);else space.tour=tour;
  if(tour){if(lenis)lenis.stop();window.scrollTo(0,0);
    if(window.gsap&&!reduced)reveal('.dock>*',30,.6,.08,0)}
  else{if(lenis)lenis.start();
    if(window.gsap&&!reduced)reveal('#viewer .panel',18,.5,.07,0)}
  if(updHash)try{history.replaceState(null,'','#'+(tour?'space-tour':(S.T.custom?'sky-viewer':S.T.id)))}catch(_){}
}
$('#tab-viewer').onclick=()=>setView('viewer',true);
$('#tab-tour').onclick=()=>setView('tour',true);
addEventListener('hashchange',()=>{
  const h=location.hash.slice(1);
  if(h==='space-tour')setView('tour',false);
  else{const T=TARGETS.find(x=>x.id===h);setView('viewer',false);if(T&&T!==S.T)setTarget(T,false)}
});
initViewer();
initSpace();
setView(location.hash.slice(1)==='space-tour'?'tour':'viewer',false);
if(window.gsap&&!reduced){
  reveal('.intro>*',16,.7,.08,0);
  reveal('#viewer .panel',26,.8,.1,.15);
}
