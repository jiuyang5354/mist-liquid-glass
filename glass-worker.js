import {outpaceMap,smoothPath} from './liquid-optics.js?v=3.6.1';

const images=new Map();
async function image(url){
  if(!images.has(url))images.set(url,fetch(url).then(r=>r.blob()).then(b=>createImageBitmap(b,{premultiplyAlpha:'none'})));
  return images.get(url);
}
const canvas=(w,h)=>new OffscreenCanvas(Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));
const split=value=>{let depth=0,last=0,out=[];for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(value[i]===','&&!depth){out.push(value.slice(last,i).trim());last=i+1;}}out.push(value.slice(last).trim());return out;};
const bitmap=c=>createImageBitmap(c,{premultiplyAlpha:'none',colorSpaceConversion:'none'});
function stops(parts,length){
  const list=[];
  for(const part of parts){
    const match=part.match(/^(.*?\)|[a-z]+)\s*(.*)$/i),color=match[1],positions=match[2].trim().split(/\s+/).filter(Boolean);
    if(!positions.length)list.push({color,t:null});
    else for(const p of positions)list.push({color,t:parseFloat(p)/(p.endsWith('%')?100:length)});
  }
  list[0].t??=0;list.at(-1).t??=1;
  for(let i=1;i<list.length;i++)if(list[i].t==null){const start=i-1;let end=i;while(list[end].t==null)end++;for(let j=i;j<end;j++)list[j].t=list[start].t+(list[end].t-list[start].t)*(j-start)/(end-start);i=end;}
  return list;
}
function gradient(ctx,value,w,h){
  const match=value.match(/^(repeating-)?(linear|radial)-gradient\((.*)\)$/),parts=split(match[3]);
  let descriptor='';if(/deg$|^ellipse|^circle|^at /.test(parts[0]))descriptor=parts.shift();
  let g,length;
  ctx.save();
  if(match[2]==='linear'){
    const angle=parseFloat(descriptor||'180')*Math.PI/180,dx=Math.sin(angle),dy=-Math.cos(angle);length=Math.abs(w*dx)+Math.abs(h*dy);
    g=ctx.createLinearGradient(w/2-dx*length/2,h/2-dy*length/2,w/2+dx*length/2,h/2+dy*length/2);
  }else{
    const position=descriptor.match(/at\s+([\d.]+)%\s+([\d.]+)%/),cx=position?w*Number(position[1])/100:w/2,cy=position?h*Number(position[2])/100:h/2;
    let rx=Math.max(cx,w-cx)*Math.SQRT2,ry=Math.max(cy,h-cy)*Math.SQRT2;
    if(descriptor.startsWith('circle'))rx=ry=Math.hypot(Math.max(cx,w-cx),Math.max(cy,h-cy));
    length=rx;ctx.translate(cx,cy);ctx.scale(rx,ry);g=ctx.createRadialGradient(0,0,0,0,0,1);
  }
  const colors=stops(parts,length);
  if(match[1]){
    const period=colors.at(-1).t-colors[0].t;
    for(let k=-1;k<Math.ceil(1/period)+1;k++)for(const c of colors){const t=c.t+k*period;if(t>=0&&t<=1)g.addColorStop(t,c.color);}
  }else for(const c of colors)g.addColorStop(Math.max(0,Math.min(1,c.t)),c.color);
  ctx.fillStyle=g;
  if(match[2]==='radial')ctx.fillRect(-100,-100,200,200);else ctx.fillRect(0,0,w,h);
  ctx.restore();
}
function layerImage(value,w,h,scale=1){
  const c=canvas(w*scale,h*scale),ctx=c.getContext('2d',{willReadFrequently:true});ctx.scale(scale,scale);
  if(value&&value!=='none')for(const part of split(value).reverse())gradient(ctx,part,w,h);
  return c;
}
function recolor(source,inverse=false){
  const c=canvas(source.width,source.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
  const data=ctx.getImageData(0,0,c.width,c.height);
  for(let i=0;i<data.data.length;i+=4)for(let k=0;k<3;k++)data.data[i+k]=inverse?255-data.data[i+k]:0;
  ctx.putImageData(data,0,0);return c;
}
async function scene(config){
  const {width:w,height:h,dpr,photo,grain,noise,dots,paper,haze,affine}=config,pad=64;
  const [clean,grainImage,noiseImage]=await Promise.all([image(photo.url),image(grain.url),image(noise.url)]);
  const photograph=canvas((w+pad*2)*dpr,(h+pad*2)*dpr),ctx=photograph.getContext('2d');ctx.scale(dpr,dpr);ctx.translate(pad,pad);
  ctx.fillStyle='#151b18';ctx.fillRect(-pad,-pad,w+pad*2,h+pad*2);
  function draw(img,layer){
    if(layer.opacity<=0)return;
    const r=layer.rect,ratio=Math.max(r.width/img.width,r.height/img.height),dw=img.width*ratio,dh=img.height*ratio;
    ctx.save();ctx.globalAlpha=layer.opacity;ctx.filter=layer.filter;ctx.drawImage(img,r.x+(r.width-dw)/2,r.y+(r.height-dh)/2,dw,dh);ctx.restore();
  }
  draw(clean,photo);draw(grainImage,grain);
  const factor=canvas(w*dpr,h*dpr),offset=canvas(w*dpr,h*dpr),a=factor.getContext('2d'),b=offset.getContext('2d');
  a.fillStyle='#fff';a.fillRect(0,0,factor.width,factor.height);b.fillStyle='#000';b.fillRect(0,0,offset.width,offset.height);
  for(const layer of affine){
    if(layer.opacity<=0)continue;
    const source=layerImage(layer.background,w,h,dpr);a.globalAlpha=b.globalAlpha=layer.opacity;
    if(layer.blend==='multiply'){a.globalCompositeOperation=b.globalCompositeOperation='multiply';a.drawImage(source,0,0);b.drawImage(source,0,0);}
    else if(layer.blend==='screen'){a.globalCompositeOperation='multiply';b.globalCompositeOperation='screen';a.drawImage(recolor(source,true),0,0);b.drawImage(source,0,0);}
    else{a.globalCompositeOperation=b.globalCompositeOperation='source-over';a.drawImage(recolor(source),0,0);b.drawImage(source,0,0);}
  }
  const dot=layerImage(dots.background,4,4,dpr),paperTile=layerImage(split(paper.background)[0],4,6,dpr);
  const noiseTile=canvas(230*dpr,230*dpr);noiseTile.getContext('2d').drawImage(noiseImage,0,0,noiseTile.width,noiseTile.height);
  const paperLayer=canvas(420*dpr,420*dpr),paperContext=paperLayer.getContext('2d');paperContext.drawImage(noiseImage,0,0,paperLayer.width,paperLayer.height);paperContext.fillStyle=paperContext.createPattern(paperTile,'repeat');paperContext.fillRect(0,0,paperLayer.width,paperLayer.height);
  const mist=layerImage(haze.background,w,h,dpr);
  const result={photo:await bitmap(photograph),factor:await bitmap(factor),offset:await bitmap(offset),noise:await bitmap(noiseTile),dots:await bitmap(dot),paper:await bitmap(paperLayer),haze:await bitmap(mist)};
  const keep=new Set([photo.url,grain.url,noise.url]);for(const [url,promise] of images)if(!keep.has(url)){images.delete(url);void promise.then(i=>i.close());}
  return result;
}
self.onmessage=async event=>{
  const {id,type,config}=event.data;
  try{
    if(type==='map'){
      const map=outpaceMap(config),mask=canvas(512,512),ctx=mask.getContext('2d');ctx.scale(512/config.width,512/config.height);ctx.fillStyle='#fff';ctx.fill(new Path2D(smoothPath(config.width,config.height,config.radius,.6)));
      const result={map:await bitmap(map),mask:await bitmap(mask)};self.postMessage({id,result},Object.values(result));
    }else{const result=await scene(config);self.postMessage({id,result},Object.values(result));}
  }catch(error){self.postMessage({id,error:error.message});}
};
