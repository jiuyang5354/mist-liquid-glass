/* Keep GPU initialization, shader work and uploads off the UI thread. At most
 * one frame is in flight; a busy renderer receives only the latest next frame. */
export class GlassGPUClient{
 constructor(canvas,onerror){
  this.canvas=canvas;this.nextTexture=0;this.inFlight=false;this.latest=null;
  this.worker=new Worker(new URL('./glass-render-worker.js?v=3.6.1',import.meta.url),{type:'module'});
  this.initialized=new Promise((resolve,reject)=>{
   this.worker.onmessage=({data})=>{
    if(data.type==='ready')resolve();
    else if(data.type==='error'){reject(Error(data.error));onerror(Error(data.error));}
    else if(data.type==='frame'){
     this.inFlight=false;this.onframe?.();
     if(this.latest){const frame=this.latest;this.latest=null;this.send(frame);}
    }
   };
  });
  this.worker.onerror=onerror;
  const offscreen=canvas.transferControlToOffscreen();this.worker.postMessage({type:'init',canvas:offscreen},[offscreen]);
 }
 ready(){return this.initialized;}
 resize(width,height,dpr){this.width=width;this.height=height;this.dpr=dpr;this.worker.postMessage({type:'resize',width,height,dpr});}
 texture(bitmap){const id=++this.nextTexture;this.worker.postMessage({type:'texture',id,bitmap},[bitmap]);return id;}
 deleteTexture(id){this.worker.postMessage({type:'delete',id});}
 setScene(bitmaps){this.worker.postMessage({type:'scene',bitmaps},Object.values(bitmaps));}
 send(frame){this.inFlight=true;this.worker.postMessage(frame);}
 render(entries,settings,config,motion){
  const frame={type:'frame',entries:entries.map(({type,rect,map})=>({type,rect,map})),settings:{...settings},config:{tone:config.tone,dots:{opacity:config.dots.opacity},noise:{opacity:config.noise.opacity},paper:{opacity:config.paper.opacity},haze:{opacity:config.haze.opacity}},motion};
  if(this.inFlight)this.latest=frame;else this.send(frame);
 }
 terminate(){this.worker.terminate();}
}
