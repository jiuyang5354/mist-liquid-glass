import {smoothPath} from './liquid-optics.js?v=3.6.1';
import {GlassGPUClient} from './glass-gpu-client.js?v=3.6.1';
const NS='http://www.w3.org/2000/svg';
const settings={enabled:true,strength:38,highlight:30,dispersion:0};
const lenses=new Map(),maps=new Map(),jobs=new Map();
const transparency=matchMedia('(prefers-reduced-transparency: reduce)'),motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const movingPhoto=document.querySelector('.scene-motion-world');
let gpu,canvas,probe,worker,observer,sceneConfig,sceneKey='',sceneTicket=0,job=0,rimId=0;
let frame=0,layoutDirty=true,paintDirty=true,trackingUntil=0,mapTimer=0,sceneTimer=0,lastPaint=-Infinity,booting=true,broken=false;
function svg(tag,attrs={}){const n=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))n.setAttribute(key,String(value));return n;}
function request(type,config){const id=++job;return new Promise((resolve,reject)=>{jobs.set(id,{resolve,reject});worker.postMessage({id,type,config});});}
function fail(error){broken=true;console.warn('MIST: optical renderer unavailable',error);document.body.classList.add('optics-fallback');if(canvas)canvas.hidden=true;}
function queue(layout=false){layoutDirty||=layout;paintDirty=true;if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
function makeRim(){
 const n=svg('svg',{width:'100%',height:'100%',class:'liquid-rim'}),defs=svg('defs'),id='mist-rim-'+(++rimId);
 const gradient=svg('linearGradient',{id,x1:.28869086912965025,y1:.04684610648167503,x2:.7113091308703497,y2:.953153893518325});
 for(const [offset,alpha] of [[0,.85],[.5,.12],[1,.45]])gradient.append(svg('stop',{offset,'stop-color':'#fff','stop-opacity':alpha}));
 defs.append(gradient);n.append(defs,svg('path',{fill:'none',stroke:`url(#${id})`,'stroke-width':1.5}));return n;
}
function attach(target,type){
 if(lenses.has(target))return;
 const wrap=document.createElement('span');wrap.className='glass-optic';wrap.setAttribute('aria-hidden','true');let rim=null,preview=null;
 if(type!=='card'){const tint=document.createElement('span');tint.className='liquid-tint';rim=makeRim();wrap.append(tint,rim);}
 if(target.classList.contains('material-orb')){preview=document.createElement('canvas');preview.className='glass-preview';wrap.prepend(preview);}
 if(type==='icon'){const label=document.createElement('span');label.className='optical-icon-label';for(const node of [...target.childNodes])if(node.nodeType===Node.TEXT_NODE)label.append(node);target.prepend(label);}
 target.prepend(wrap);target.classList.add('liquid-surface','optic-'+type);
 lenses.set(target,{target,type,wrap,rim,preview,rect:null,map:null,mapKey:'',visible:false});observer?.observe(target);
}
function trimMaps(){
 if(maps.size<=10)return;const used=new Set([...lenses.values()].map(e=>e.mapKey));
 for(const [key,pending] of maps){if(maps.size<=10)break;if(used.has(key))continue;maps.delete(key);void pending.then(m=>{gpu.deleteTexture(m.map);gpu.deleteTexture(m.mask);}).catch(()=>{});}
}
function mapFor(entry){
 if(entry.type==='card'||!entry.visible)return;
 const width=Math.round(entry.rect.width),height=Math.round(entry.rect.height),radius=parseFloat(getComputedStyle(entry.target).borderTopLeftRadius)||22;
 const depth=Math.min(12,height*.4),key=[width,height,radius,settings.strength].join(':');if(entry.mapKey===key)return;entry.mapKey=key;
 if(!maps.has(key))maps.set(key,request('map',{width,height,radius,depth,scale:depth*1.6*settings.strength/38}).then(bitmaps=>({map:gpu.texture(bitmaps.map),mask:gpu.texture(bitmaps.mask)})));
 void maps.get(key).then(map=>{if(entry.mapKey!==key)return;entry.map=map;queue();trimMaps();}).catch(fail);
}
function geometry(){
 layoutDirty=false;paintDirty=true;const w=innerWidth,h=innerHeight,dpr=devicePixelRatio||1;
 if(gpu.width!==w||gpu.height!==h||gpu.dpr!==dpr){gpu.resize(w,h,dpr);probe.style.width=w+'px';probe.style.height=h+'px';refreshScene();}
 const measured=[];
 for(const [target,entry] of lenses){if(!target.isConnected){observer.unobserve(target);lenses.delete(target);continue;}const r=target.getBoundingClientRect();measured.push([entry,{x:r.x,y:r.y,width:r.width,height:r.height}]);}
 for(const [entry,r] of measured){
  const previous=entry.rect;entry.rect=r;entry.visible=r.width>1&&r.height>1&&r.x+r.width>0&&r.y+r.height>0&&r.x<w&&r.y<h;
  if(entry.preview)entry.visible&&=!!document.querySelector('#settingsPanel.open');
  if(entry.rim&&(!previous||previous.width!==r.width||previous.height!==r.height)){
   const radius=parseFloat(getComputedStyle(entry.target).borderTopLeftRadius)||22,path=smoothPath(Math.round(r.width),Math.round(r.height),radius,.6);entry.wrap.style.clipPath=`path("${path}")`;entry.rim.querySelector('path').setAttribute('d',path);
  }
  if(entry.preview&&entry.visible){const pw=Math.round(r.width*dpr),ph=Math.round(r.height*dpr);if(entry.preview.width!==pw)entry.preview.width=pw;if(entry.preview.height!==ph)entry.preview.height=ph;}
  mapFor(entry);
 }
}
function sceneProbe(){
 const world=document.createElement('div');world.className='glass-world optical-world glass-source-probe';world.setAttribute('aria-hidden','true');const photo=document.createElement('div');photo.className='optical-photo';world.append(photo);
 for(const [name,cls] of [['clean','scene-clean'],['grain','scene-grain'],['dots','scene-dotprint'],['noise','scene-noise'],['tone','scene-tone'],['haze','scene-haze'],['paper','scene-paper'],['scan','scene-scan'],['leak','scene-leak'],['dimmer','scene-dimmer'],['vignette','scene-vignette']]){const layer=document.createElement('div');layer.className=`optical-scene-layer optical-${name} ${cls}`;(name==='clean'||name==='grain'?photo:world).append(layer);}
 document.body.append(world);return world;
}
const url=background=>background.match(/url\(["']?(.*?)["']?\)/)?.[1];
function config(){
 const layer=name=>{const n=probe.querySelector('.optical-'+name),c=getComputedStyle(n),r=n.getBoundingClientRect();return {background:c.backgroundImage,opacity:Number(c.opacity),blend:c.mixBlendMode,url:url(c.backgroundImage),filter:c.filter,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};};
 const tone=getComputedStyle(probe.querySelector('.optical-tone')).backgroundColor.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];if(tone.length===3)tone.push(1);for(let i=0;i<3;i++)tone[i]/=255;
 return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio||1,photo:layer('clean'),grain:layer('grain'),noise:layer('noise'),dots:layer('dots'),paper:layer('paper'),haze:layer('haze'),affine:['scan','leak','dimmer','vignette'].map(layer),tone};
}
function refreshScene(delay=0){
 clearTimeout(sceneTimer);sceneTimer=setTimeout(()=>{
  const next=config(),key=JSON.stringify(next);if(key===sceneKey)return;sceneKey=key;const ticket=++sceneTicket;
  void request('scene',next).then(bitmaps=>{if(ticket!==sceneTicket){for(const bitmap of Object.values(bitmaps))bitmap.close();return;}gpu.setScene(bitmaps);sceneConfig=next;queue();}).catch(error=>{if(ticket===sceneTicket)fail(error);});
 },delay);
}
function moving(){return document.body.classList.contains('motion-on')&&!motionPreference.matches&&!document.hidden;}
function draw(time){
 frame=0;if(document.hidden||broken)return;if(time<trackingUntil)layoutDirty=true;if(layoutDirty)geometry();
 const active=settings.enabled&&settings.strength>0&&!transparency.matches;canvas.hidden=!active;
 if(active&&sceneConfig&&(paintDirty||(moving()&&time-lastPaint>=1000/60))){
  const matrix=moving()?new DOMMatrixReadOnly(getComputedStyle(movingPhoto).transform):{a:1,d:1,e:0,f:0},visible=[...lenses.values()].filter(e=>e.visible);
  gpu.render(visible,settings,sceneConfig,[matrix.a,matrix.d,matrix.e,matrix.f]);
  paintDirty=false;lastPaint=time;
 }
 if((active&&moving())||time<trackingUntil)frame=requestAnimationFrame(draw);
}
export function rebuildLiquidGlass(){
 if(!worker)return;
 if(!gpu)return;const search=document.querySelector('#searchForm');if(search)attach(search,'search');const sample=document.querySelector('.material-orb');if(sample)attach(sample,'icon');document.querySelectorAll('#shortcuts .shortcut-round').forEach(n=>attach(n,'icon'));document.querySelectorAll('#favoritesGrid .favorite-card:not(.favorite-add)').forEach(n=>attach(n,'card'));queue(true);
}
export function updateLiquidGlass(options){
 const previous=settings.strength;Object.assign(settings,options);const active=settings.enabled&&settings.strength>0&&!transparency.matches;
 document.body.classList.toggle('glass-off',!active);document.documentElement.style.setProperty('--liquid-alpha',active?'1':'0');document.documentElement.style.setProperty('--liquid-rim-opacity',String(Math.min(1.5,settings.highlight/30)));
 if(!gpu||!worker)return;if(previous!==settings.strength){clearTimeout(mapTimer);mapTimer=setTimeout(()=>{for(const entry of lenses.values())mapFor(entry);},100);}refreshScene(60);queue();
}
export async function setupLiquidGlass(){
 try{
  document.body.classList.add('optics-fallback');
  canvas=document.createElement('canvas');canvas.className='glass-gpu';canvas.setAttribute('aria-hidden','true');document.querySelector('.scene').after(canvas);gpu=new GlassGPUClient(canvas,fail);await gpu.ready();probe=sceneProbe();
  gpu.onframe=()=>{
   if(booting){document.body.classList.remove('optics-fallback');booting=false;}
   for(const entry of lenses.values())if(entry.visible&&(entry.type==='card'||entry.map)){
    entry.target.classList.add('optically-loaded');
    if(entry.preview)requestAnimationFrame(()=>{const r=entry.rect,dpr=gpu.dpr,ctx=entry.preview.getContext('2d');ctx.clearRect(0,0,entry.preview.width,entry.preview.height);ctx.drawImage(canvas,r.x*dpr,r.y*dpr,r.width*dpr,r.height*dpr,0,0,entry.preview.width,entry.preview.height);});
   }
  };
  worker=new Worker(new URL('./glass-worker.js?v=3.6.1',import.meta.url),{type:'module'});worker.onmessage=event=>{const {id,result,error}=event.data,pending=jobs.get(id);if(!pending)return;jobs.delete(id);error?pending.reject(Error(error)):pending.resolve(result);};worker.onerror=fail;
  observer=new ResizeObserver(()=>queue(true));addEventListener('resize',()=>queue(true),{passive:true});document.addEventListener('scroll',()=>queue(true),{passive:true,capture:true});
  document.addEventListener('transitionrun',event=>{if(event.propertyName==='transform'&&[...lenses.keys()].some(n=>event.target===n||event.target.contains(n))){trackingUntil=performance.now()+400;queue(true);}},true);
  const panel=document.querySelector('#settingsPanel');if(panel)new MutationObserver(()=>{trackingUntil=performance.now()+400;queue(true);}).observe(panel,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else queue(true);});transparency.addEventListener('change',()=>updateLiquidGlass(settings));motionPreference.addEventListener('change',()=>queue());
  addEventListener('pagehide',event=>{if(!event.persisted){worker.terminate();gpu.terminate();cancelAnimationFrame(frame);}},{once:true});
  rebuildLiquidGlass();updateLiquidGlass(settings);
 }catch(error){fail(error);}
}
