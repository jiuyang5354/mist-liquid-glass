import { setupLiquidGlass, updateLiquidGlass, rebuildLiquidGlass } from './glass.js?v=3.6.5';
/* MIST New Tab: local-only, no analytics, no external JS dependencies. */
const $ = (selector) => document.querySelector(selector);
const DEFAULTS = Object.freeze({
  grain: 65, brightness: 45, blur: 0, motion: false, engine: 'google', glass: true, glassStrength: 38, glassHighlight: 30, glassDispersion: 0,
  preset: 'original', contrast: 100, saturation: 100, warmth: 0, haze: 0, vignette: 48, texture: 'none', textureStrength: 35
});
// Each preset is just an editable starting point, not a destructive bitmap transform.
const LOOKS = Object.freeze({
  original: { label:'原片', description:'原始雾林色调，保留自然层次。', contrast:100,saturation:100,warmth:0,haze:0,vignette:48,texture:'none',textureStrength:35,grain:65,brightness:45,blur:0,gray:0 },
  cinema: { label:'电影', description:'加强明暗与层次，保留克制的森林绿色。', contrast:122,saturation:78,warmth:-7,haze:10,vignette:57,texture:'film',textureStrength:24,grain:38,brightness:45,blur:0,gray:0 },
  noir: { label:'黑白', description:'高对比黑白，突出林海与雾带的明暗关系。', contrast:131,saturation:0,warmth:0,haze:5,vignette:62,texture:'film',textureStrength:28,grain:48,brightness:47,blur:0,gray:100 },
  cyan: { label:'冷雾', description:'青蓝色空气感，减少黄绿色偏色。', contrast:105,saturation:76,warmth:-48,haze:36,vignette:42,texture:'none',textureStrength:25,grain:36,brightness:48,blur:0,gray:0 },
  vintage: { label:'旧胶片', description:'温暖胶片色调、颗粒与轻微褪色。', contrast:92,saturation:74,warmth:36,haze:16,vignette:57,texture:'film',textureStrength:55,grain:74,brightness:49,blur:0,gray:0 },
  night: { label:'午夜', description:'低照度蓝黑森林，压住远处过亮雾气。', contrast:118,saturation:64,warmth:-33,haze:5,vignette:70,texture:'none',textureStrength:25,grain:27,brightness:23,blur:0,gray:0 },
  archive: { label:'纸本档案', description:'复古印刷网点与纸张纤维，适合图文背景。', contrast:113,saturation:57,warmth:44,haze:13,vignette:43,texture:'paper',textureStrength:64,grain:78,brightness:55,blur:0,gray:0 },
  dream: { label:'柔光', description:'亮部轻微漫射，弱化硬对比和图像边缘。', contrast:88,saturation:92,warmth:15,haze:58,vignette:30,texture:'none',textureStrength:25,grain:28,brightness:58,blur:2,gray:0 }
});
const TEXTURES = new Set(['none','film','paper','scan','leak']);
const PALETTE = ['#405b5a','#57635a','#5b5369','#746151','#365a65','#556574','#4e6457','#65596a'];
const DEFAULT_SHORTCUTS = [
  { title: 'GitHub', url: 'https://github.com', icon: 'GH' },
  { title: 'Figma', url: 'https://figma.com', icon: 'F' },
  { title: 'Are.na', url: 'https://www.are.na', icon: 'A' },
  { title: 'Pinterest', url: 'https://pinterest.com', icon: 'P' },
  { title: 'Behance', url: 'https://www.behance.net', icon: 'Be' },
  { title: 'Dribbble', url: 'https://dribbble.com', icon: 'Dr' },
  { title: 'ChatGPT', url: 'https://chatgpt.com', icon: '✳' },
  { title: 'Google', url: 'https://google.com', icon: 'G' }
];
const DEFAULT_FAVORITES = [
  { title: 'Awwwards', url: 'https://www.awwwards.com', description: '优秀网站与交互设计灵感', icon: 'Aw' },
  { title: 'Figma Community', url: 'https://www.figma.com/community', description: '设计资源、组件与创意探索', icon: 'F' },
  { title: 'Pinterest', url: 'https://www.pinterest.com', description: '视觉参考与灵感收集', icon: 'P' },
  { title: 'Are.na', url: 'https://www.are.na', description: '把有趣的想法连接起来', icon: 'A' },
  { title: 'Unsplash', url: 'https://unsplash.com', description: '高质量摄影与图片素材', icon: 'U' }
];
const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  baidu: 'https://www.baidu.com/s?wd=',
  duckduckgo: 'https://duckduckgo.com/?q='
};
const DATA_KEY = 'mist-tab-state-v1';
let state = {
  settings: { ...DEFAULTS },
  shortcuts: structuredClone(DEFAULT_SHORTCUTS),
  favorites: structuredClone(DEFAULT_FAVORITES)
};
let editing = null;
let customWallpaper = false;
let currentWallpaperURL = null;
let currentWallpaperMime = 'image/webp';
let toastTimer = null;
let saveTimer = null;

function safeData(data) {
  if (!data || typeof data !== 'object') return;
  const s = data.settings || {};
  const clamp = (value, min, max, otherwise) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : otherwise;
  state.settings = {
    grain: clamp(s.grain,0,100,DEFAULTS.grain),
    brightness: clamp(s.brightness,0,100,DEFAULTS.brightness),
    blur: clamp(s.blur,0,10,DEFAULTS.blur),
    motion: Boolean(s.motion),
    engine: SEARCH_ENGINES[s.engine] ? s.engine : DEFAULTS.engine,
    glass: s.glass === undefined ? true : Boolean(s.glass),
    glassStrength: clamp(s.glassStrength,0,100,DEFAULTS.glassStrength),
    glassHighlight: clamp(s.glassHighlight,0,100,DEFAULTS.glassHighlight),
    glassDispersion: clamp(s.glassDispersion,0,100,DEFAULTS.glassDispersion),
    preset: LOOKS[s.preset] || s.preset === 'custom' ? s.preset : DEFAULTS.preset,
    contrast: clamp(s.contrast,60,160,DEFAULTS.contrast),
    saturation: clamp(s.saturation,0,170,DEFAULTS.saturation),
    warmth: clamp(s.warmth,-60,60,DEFAULTS.warmth),
    haze: clamp(s.haze,0,100,DEFAULTS.haze),
    vignette: clamp(s.vignette,0,100,DEFAULTS.vignette),
    texture: TEXTURES.has(s.texture) ? s.texture : DEFAULTS.texture,
    textureStrength: clamp(s.textureStrength,0,100,DEFAULTS.textureStrength)
  };
  for (const type of ['shortcuts', 'favorites']) {
    if (Array.isArray(data[type])) {
      state[type] = data[type].slice(0,32).filter(entry =>
        entry && typeof entry.title === 'string' && typeof entry.url === 'string' &&
        Boolean(normalizeSiteUrl(entry.url))
      ).map(entry => ({
        title: entry.title.slice(0,40),
        url: normalizeSiteUrl(entry.url),
        description: String(entry.description || '').slice(0,64),
        icon: String(entry.icon || '').slice(0,3)
      }));
    }
  }
}
async function loadSaved() {
  try {
    if (globalThis.chrome?.storage?.local) {
      const data = await chrome.storage.local.get(DATA_KEY);
      safeData(data[DATA_KEY]);
    } else {
      const data = localStorage.getItem(DATA_KEY);
      if (data) safeData(JSON.parse(data));
    }
  } catch (e) { console.warn('MIST: settings read failed', e); }
}
async function saveSaved() {
  const snapshot = structuredClone(state);
  try {
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.set({[DATA_KEY]: snapshot});
    } else {
      localStorage.setItem(DATA_KEY, JSON.stringify(snapshot));
    }
  } catch (e) { showToast('无法保存设置，请检查浏览器存储权限'); }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSaved, 220);
}
function normalizeSiteUrl(raw) {
  if (typeof raw !== 'string') return null;
  const input = raw.trim();
  if (!input || /[\s\u0000-\u001f]/.test(input)) return null;
  if (/^(chrome|edge):\/\/([\w.-]+)(\/[^\s]*)?$/i.test(input)) return input;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    return url.href;
  } catch { return null; }
}
function classifySearchInput(input) {
  const q = input.trim();
  if (!q) return null;
  // Treat a URL as a URL only when it looks like one. Everything else is a search.
  const looksLikeSite = !/\s/.test(q) && (
    /^(https?:\/\/|chrome:\/\/|edge:\/\/)/i.test(q) ||
    /^(localhost|(?:\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i.test(q) ||
    /^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(q)
  );
  return looksLikeSite ? normalizeSiteUrl(q) || SEARCH_ENGINES[state.settings.engine]+encodeURIComponent(q)
    : SEARCH_ENGINES[state.settings.engine]+encodeURIComponent(q);
}
function iconName(title) {
  const letters = title.trim().split(/\s+/).map(x=>x[0] || '').join('').slice(0,2);
  return letters || title.slice(0,2) || '↗';
}
function colorFor(index) { return PALETTE[index % PALETTE.length]; }
function siteDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./,''); }
  catch { return url.replace(/^[a-z]+:\/\//,'').split('/')[0]; }
}
function el(tag, cls, content) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (content !== undefined) node.textContent = content;
  return node;
}
function renderShortcuts() {
  const root = $('#shortcuts'); root.replaceChildren();
  state.shortcuts.forEach((entry,index)=>{
    const wrapper = el('div','shortcut');
    const link = el('a','shortcut-link');
    link.href = entry.url; link.title = entry.title;
    const chip = el('span','shortcut-round',entry.icon || iconName(entry.title));
    chip.style.setProperty('--chip',colorFor(index));
    const label = el('span','shortcut-name',entry.title);
    link.append(chip,label);
    const edit = el('button','shortcut-edit','·');
    edit.type='button'; edit.textContent='⋯'; edit.setAttribute('aria-label',`编辑 ${entry.title}`);
    edit.title=`编辑 ${entry.title}`;
    edit.addEventListener('click',()=>openEditor('shortcuts',index));
    wrapper.append(link,edit); root.append(wrapper);
  });
  if (state.shortcuts.length < 32) {
    const add=el('button','shortcut shortcut-add');add.type='button';add.title='添加快捷网站';
    add.append(el('span','shortcut-round','+'),el('span','shortcut-name','添加'));
    add.addEventListener('click',()=>openEditor('shortcuts'));
    root.append(add);
  }
}
function renderFavorites() {
  const root = $('#favoritesGrid');root.replaceChildren();
  $('#favoritesCount').textContent=String(state.favorites.length).padStart(2,'0');
  state.favorites.forEach((entry,index)=>{
    const card=el('div','favorite-card');
    const link=el('a','favorite-link');link.href=entry.url;link.title=`打开 ${entry.title}`;
    const head=el('div','favorite-head');
    const chip=el('span','favorite-icon',entry.icon || iconName(entry.title));
    chip.style.setProperty('--chip',colorFor(index+3));
    head.append(chip,el('span','favorite-name',entry.title));
    link.append(head,el('div','favorite-desc',entry.description || '一个值得常常打开的地方'),el('span','favorite-url',siteDomain(entry.url)));
    const edit = el('button','favorite-edit'); edit.type='button';
    const dots=document.createElementNS('http://www.w3.org/2000/svg','svg');
    dots.setAttribute('viewBox','0 0 16 16');dots.setAttribute('aria-hidden','true');
    for(const x of [4,8,12]){
      const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
      dot.setAttribute('cx',x);dot.setAttribute('cy',8);dot.setAttribute('r',1);dots.append(dot);
    }
    edit.append(dots);
    edit.title=`编辑 ${entry.title}`;edit.setAttribute('aria-label',`编辑 ${entry.title}`);
    edit.addEventListener('click',()=>openEditor('favorites',index));
    card.append(link,edit);root.append(card);
  });
  if(state.favorites.length < 32){
    const add=el('button','favorite-card favorite-add');add.type='button';add.setAttribute('aria-label','添加收藏站点');
    const plus=document.createElementNS('http://www.w3.org/2000/svg','svg');
    plus.setAttribute('viewBox','0 0 24 24');plus.setAttribute('fill','none');plus.setAttribute('stroke','currentColor');plus.setAttribute('stroke-width','1.2');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M12 4v16M4 12h16');plus.append(path);
    add.append(plus,el('span',null,'ADD A NEW SITE'));add.addEventListener('click',()=>openEditor('favorites'));root.append(add);
  }
}
function toastOff(){ $('#toast').classList.remove('visible'); }
function showToast(msg){
  $('#toast').textContent=msg;$('#toast').classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(toastOff,3200);
}
function clockTick() {
  const now = new Date();
  $('#clockTime').textContent = new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
  $('#clockDate').textContent = new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',weekday:'short'}).format(now).replaceAll('/','.');
}
function applySettings() {
  const {grain,brightness,blur,motion,engine,glass,glassStrength,glassHighlight,glassDispersion} = state.settings;
  const root=document.documentElement;
  root.style.setProperty('--grain-blend', customWallpaper?'0':String(grain/100));
  root.style.setProperty('--dot-opacity',String((grain/100)*(customWallpaper? .31:.23)));
  root.style.setProperty('--noise-opacity',String((grain/100)*.22 + (state.settings.texture==='film'?state.settings.textureStrength/100*.26:0)));
  root.style.setProperty('--brightness',String(.67+brightness*.0065));
  root.style.setProperty('--blur',`${blur}px`);
  root.style.setProperty('--image-contrast',(state.settings.contrast/100).toFixed(3));
  root.style.setProperty('--image-saturation',(state.settings.saturation/100).toFixed(3));
  root.style.setProperty('--image-gray',`${LOOKS[state.settings.preset]?.gray || 0}%`);
  root.style.setProperty('--vignette-alpha',(state.settings.vignette/100*.58).toFixed(3));
  root.style.setProperty('--haze-opacity',(state.settings.haze/100*.52).toFixed(3));
  const heat=state.settings.warmth/60;
  root.style.setProperty('--tone-color',heat>=0?`rgba(238,168,88,${(heat*.27).toFixed(3)})`:`rgba(81,171,204,${(-heat*.24).toFixed(3)})`);
  const t=state.settings.texture;
  root.style.setProperty('--paper-opacity',t==='paper'?String(state.settings.textureStrength/100*.4):'0');
  root.style.setProperty('--scan-opacity',t==='scan'?String(state.settings.textureStrength/100*.28):'0');
  root.style.setProperty('--leak-opacity',t==='leak'?String(state.settings.textureStrength/100*.65):'0');
  root.style.setProperty('--film-grain-boost',t==='film'?String(state.settings.textureStrength/100*.29):'0');
  // Set the tint independently of brightness so cool and warm presets do not color the glass UI.
  $('#presetDescription').textContent=LOOKS[state.settings.preset]?.description || '自定义影像参数。';
  document.querySelectorAll('[data-preset]').forEach(node=>{
    const active=node.dataset.preset===state.settings.preset;
    node.classList.toggle('is-active',active);node.setAttribute('aria-pressed',String(active));
  });
  document.querySelectorAll('[data-texture]').forEach(node=>{
    const active=node.dataset.texture===t;
    node.classList.toggle('is-active',active);node.setAttribute('aria-pressed',String(active));
  });
  for(const [key,id,unit] of [['contrast','contrast','%'],['saturation','saturation','%'],['warmth','warmth',''],['haze','haze','%'],['vignette','vignette','%'],['textureStrength','texture','%']]){
    $(`#${id}Range`).value=state.settings[key];
    $(`#${id}Output`).textContent=`${state.settings[key]>0&&key==='warmth'?'+':''}${state.settings[key]}${unit}`;
  }

  document.body.classList.toggle('motion-on',motion);
  $('#grainRange').value=grain;$('#grainOutput').textContent=`${grain}%`;
  $('#brightnessRange').value=brightness;$('#brightnessOutput').textContent=`${brightness}%`;
  $('#blurRange').value=blur;$('#blurOutput').textContent=`${blur}px`;
  $('#motionToggle').checked=motion;$('#engineSelect').value=engine;
  $('#glassToggle').checked=glass;$('#glassRange').value=glassStrength;$('#glassOutput').textContent=`${glassStrength}%`;
  $('#highlightRange').value=glassHighlight;$('#highlightOutput').textContent=`${glassHighlight}%`;
  $('#dispersionRange').value=glassDispersion;$('#dispersionOutput').textContent=`${glassDispersion}%`;
  updateLiquidGlass({enabled:glass,strength:glassStrength,highlight:glassHighlight,dispersion:glassDispersion});
}
function openSettings() {
  $('#settingsOverlay').hidden=false;
  $('#settingsPanel').removeAttribute('inert');
  $('#settingsPanel').setAttribute('aria-hidden','false');
  $('#settingsPanel').classList.add('open');
  $('#closeSettings').focus();
}
function closeSettings() {
  $('#settingsPanel').classList.remove('open');
  $('#settingsPanel').setAttribute('inert','');
  $('#settingsPanel').setAttribute('aria-hidden','true');
  $('#settingsOverlay').hidden=true;
  $('#openSettings').focus();
}
function openEditor(type,index=null) {
  editing={type,index};
  const isEdit=index!==null;
  const data=isEdit?state[type][index]:null;
  $('#dialogTitle').textContent=isEdit?'编辑站点.':type==='shortcuts'?'添加快捷方式.':'添加常用站点.';
  $('#editTitle').value=data?.title||'';
  $('#editUrl').value=data?.url||'';
  $('#editDescription').value=data?.description||'';
  $('#descriptionWrap').hidden=type==='shortcuts';
  $('#deleteEntry').hidden=!isEdit;
  $('#editError').textContent='';
  if($('#settingsPanel').classList.contains('open')) closeSettings();
  $('#editDialog').showModal();
  $('#editTitle').focus();
}
function closeEditor(){ $('#editDialog').close();editing=null; }
function commitEdit(event) {
  event.preventDefault();
  if(!editing)return;
  const title=$('#editTitle').value.trim();
  const url=normalizeSiteUrl($('#editUrl').value);
  if(!title||!url){$('#editError').textContent='请填写名称和有效网址（https://example.com）。';return;}
  const {type,index}=editing;
  const existing=index===null?null:state[type][index];
  const entry={title:title.slice(0,40),url,description:$('#editDescription').value.trim().slice(0,64),icon:existing?.icon||iconName(title)};
  if(index===null){state[type].push(entry)}else{state[type][index]=entry}
  renderShortcuts();renderFavorites();rebuildLiquidGlass();scheduleSave();closeEditor();showToast('站点已保存');
}
function deleteEdit() {
  if(!editing||editing.index===null)return;
  state[editing.type].splice(editing.index,1);
  renderShortcuts();renderFavorites();rebuildLiquidGlass();scheduleSave();closeEditor();showToast('站点已删除');
}
// IndexedDB is used for the optional custom wallpaper so large images do not
// consume the tiny quota used by standard extension settings.
function openDB() {
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB) return reject(new Error('IndexedDB unavailable'));
    const r=indexedDB.open('mist-wallpaper-db',1);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('wallpapers'))r.result.createObjectStore('wallpapers');};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
async function wallpaperDB(operation,value){
  const db=await openDB();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('wallpapers',operation==='read'?'readonly':'readwrite');
      const store=tx.objectStore('wallpapers');
      const req=operation==='read'?store.get('custom'):operation==='save'?store.put(value,'custom'):store.delete('custom');
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  } finally {db.close()}
}
function setCustomWallpaper(blob) {
  if(currentWallpaperURL)URL.revokeObjectURL(currentWallpaperURL);
  currentWallpaperURL=blob?URL.createObjectURL(blob):null;
  currentWallpaperMime=blob?.type || 'image/webp';
  customWallpaper=Boolean(blob);
  const url=currentWallpaperURL?`url("${currentWallpaperURL}")`:'';
  $('#sceneClean').style.backgroundImage=url;
  document.documentElement.style.setProperty('--custom-wallpaper', customWallpaper ? url : `url('assets/wallpapers/forest-clean.webp')`);
  $('#wallpaperMini').style.backgroundImage=url;
  $('#wallpaperName').textContent=customWallpaper?'我的自定义壁纸':'Misty Forest / 01';
  $('#restoreWallpaper').disabled=!customWallpaper;
  applySettings();
}
async function loadWallpaper(){
  try { const blob=await wallpaperDB('read');if(blob instanceof Blob)setCustomWallpaper(blob); }
  catch(e){console.warn('MIST: wallpaper storage unavailable',e)}
}
async function chooseWallpaper(file) {
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp','image/avif'].includes(file.type))return showToast('请选择 JPG、PNG、WebP 或 AVIF 图片');
  if(file.size>25*1024*1024)return showToast('图片不能超过 25 MB');
  try {await wallpaperDB('save',file);setCustomWallpaper(file);showToast('新壁纸已应用并保存在本地');}
  catch(e){console.warn(e);showToast('自定义壁纸保存失败，请检查本地存储');}
}
async function restoreWallpaper(){
  try{await wallpaperDB('remove');setCustomWallpaper(null);showToast('已恢复原始雾林壁纸')}
  catch(e){console.warn(e);showToast('无法恢复壁纸')}
}
async function downloadWallpaper(){
  const anchor=document.createElement('a');
  const ext = currentWallpaperMime==='image/png' ? 'png' : currentWallpaperMime==='image/jpeg' ? 'jpg' : currentWallpaperMime==='image/avif' ? 'avif' : 'webp';
  anchor.download=customWallpaper?`mist-custom-wallpaper.${ext}`:'mist-forest-wallpaper.webp';
  anchor.href=currentWallpaperURL||'assets/wallpapers/forest-grain.webp';
  document.body.append(anchor);anchor.click();anchor.remove();
}
function bindEvents(){
  $('#searchForm').addEventListener('submit',(event)=>{
    event.preventDefault();const target=classifySearchInput($('#searchInput').value);
    if(target)window.location.assign(target);
  });
  $('#searchInput').addEventListener('focus',()=>$('#searchHint').hidden=true);
  $('#searchInput').addEventListener('blur',()=>$('#searchHint').hidden=false);
  document.addEventListener('keydown',(e)=>{
    const tag=document.activeElement?.tagName;
    if(e.key==='Escape'){
      if($('#editDialog').open){closeEditor();return;}
      if($('#settingsPanel').classList.contains('open')){closeSettings();return;}
      if(tag==='INPUT')document.activeElement.blur();
    }
    if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&
       !['INPUT','TEXTAREA','SELECT'].includes(tag)&&!$('#editDialog').open&&
       !$('#settingsPanel').classList.contains('open')){
      e.preventDefault();$('#searchInput').focus();
    }
  });
  $('#openSettings').addEventListener('click',openSettings);
  $('#closeSettings').addEventListener('click',closeSettings);
  $('#settingsOverlay').addEventListener('click',closeSettings);
  $('#wallpaperControl').addEventListener('click',openSettings);
  $('#addFavorite').addEventListener('click',()=>openEditor('favorites'));
  $('#editForm').addEventListener('submit',commitEdit);
  $('#closeEditor').addEventListener('click',closeEditor);
  $('#deleteEntry').addEventListener('click',deleteEdit);
  $('#editDialog').addEventListener('close',()=>{editing=null});
  const controls = [
    ['#grainRange','grain'],['#brightnessRange','brightness'],['#blurRange','blur']
  ];
  controls.forEach(([selector,key])=>$(selector).addEventListener('input',event=>{
    state.settings[key]=Number(event.target.value);state.settings.preset='custom';applySettings();scheduleSave();
  }));
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
    const name=button.dataset.preset;
    if(!LOOKS[name])return;
    Object.assign(state.settings,LOOKS[name],{preset:name});
    applySettings();scheduleSave();
  }));
  document.querySelectorAll('[data-texture]').forEach(button=>button.addEventListener('click',()=>{
    state.settings.texture=button.dataset.texture;
    state.settings.preset='custom';
    applySettings();scheduleSave();
  }));
  for(const [id,key] of [['contrast','contrast'],['saturation','saturation'],['warmth','warmth'],['haze','haze'],['vignette','vignette'],['texture','textureStrength']]){
    $(`#${id}Range`).addEventListener('input',event=>{
      state.settings[key]=Number(event.target.value);
      state.settings.preset='custom';applySettings();scheduleSave();
    });
  }
  $('#resetGrade').addEventListener('click',()=>{
    Object.assign(state.settings,LOOKS.original,{preset:'original'});
    applySettings();scheduleSave();showToast('已恢复原始影像参数');
  });
  $('#glassRange').addEventListener('input',event=>{state.settings.glassStrength=Number(event.target.value);applySettings();scheduleSave()});
  $('#glassToggle').addEventListener('change',event=>{state.settings.glass=event.target.checked;applySettings();scheduleSave()});
  $('#highlightRange').addEventListener('input',event=>{state.settings.glassHighlight=Number(event.target.value);applySettings();scheduleSave()});
  $('#dispersionRange').addEventListener('input',event=>{state.settings.glassDispersion=Number(event.target.value);applySettings();scheduleSave()});
  $('#motionToggle').addEventListener('change',event=>{
    state.settings.motion=event.target.checked;applySettings();scheduleSave();
  });
  $('#engineSelect').addEventListener('change',event=>{
    state.settings.engine=event.target.value;applySettings();scheduleSave();showToast('搜索引擎已更新');
  });
  $('#uploadWallpaper').addEventListener('click',()=>$('#wallpaperFile').click());
  $('#wallpaperFile').addEventListener('change',event=>{void chooseWallpaper(event.target.files?.[0]);event.target.value='';});
  $('#restoreWallpaper').addEventListener('click',()=>{void restoreWallpaper()});
  $('#downloadWallpaper').addEventListener('click',()=>{void downloadWallpaper()});
  $('#resetAll').addEventListener('click',async()=>{
    if(!confirm('恢复所有默认设置、快捷网站和原始壁纸吗？'))return;
    state={settings:{...DEFAULTS},shortcuts:structuredClone(DEFAULT_SHORTCUTS),favorites:structuredClone(DEFAULT_FAVORITES)};
    await saveSaved();
    try{await wallpaperDB('remove')}catch(e){console.warn(e)}
    setCustomWallpaper(null);renderShortcuts();renderFavorites();rebuildLiquidGlass();closeSettings();showToast('所有设置已恢复默认');
  });
}
async function init(){
  bindEvents();
  await loadSaved();
  await loadWallpaper();
  applySettings();renderShortcuts();renderFavorites();setupLiquidGlass();clockTick();
  setInterval(clockTick,15000);
}
void init();
