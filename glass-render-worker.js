import {GlassGPU} from './glass-gpu.js?v=3.6.1';
let renderer;
const textures=new Map();
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   renderer=new GlassGPU(data.canvas);await renderer.ready();
   data.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();self.postMessage({type:'error',error:'Graphics context lost'});});
   self.postMessage({type:'ready'});
  }else if(data.type==='resize')renderer.resize(data.width,data.height,data.dpr);
  else if(data.type==='texture')textures.set(data.id,renderer.texture(data.bitmap));
  else if(data.type==='delete'){renderer.gl.deleteTexture(textures.get(data.id));textures.delete(data.id);}
  else if(data.type==='scene')renderer.setScene(data.bitmaps);
  else if(data.type==='frame'){
   const entries=data.entries.map(entry=>({...entry,map:entry.map?{map:textures.get(entry.map.map),mask:textures.get(entry.map.mask)}:null}));
   renderer.render(entries,data.settings,data.config,data.motion);
   self.postMessage({type:'frame'});
  }
 }catch(error){self.postMessage({type:'error',error:error.message});}
};
