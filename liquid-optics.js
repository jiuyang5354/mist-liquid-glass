/** Material math calibrated against the public Outpace and Bubbbly demos.
 * Outpace: n=1.5, integrated surface slope, smoothed corners and directional light.
 * Bubbbly: sixth-power lens, 0.22 interior magnification, vertical light and box blur.
 * All coordinates are CSS pixels; foreground content never enters these maps.
 */
const clamp = (x,a=0,b=1) => Math.min(b,Math.max(a,x));
const radians = degrees => degrees*Math.PI/180;
const rounded = x => Number(x.toFixed(3));
const makeCanvas = () => typeof document==='undefined' ? new OffscreenCanvas(1,1) : document.createElement('canvas');
const snell = new Float32Array(256);
for(let i=0;i<256;i++){
  const x=1-i/255, x4=x*x*x*x;
  const incident=Math.atan(x*x*x/(Math.pow(1-x4,.75)+1e-4));
  snell[i]=.62*Math.sin(incident-Math.asin(Math.sin(incident)/1.5));
}

export function smoothPath(width,height,radius,smoothing=.6){
  const limit=Math.min(width,height)/2, r=Math.min(radius,limit);
  const z=rounded;
  if(r<=0)return `M 0 0 L ${z(width)} 0 L ${z(width)} ${z(height)} L 0 ${z(height)} Z`;
  const smooth=clamp(smoothing), extent=Math.min((1+smooth)*r,limit);
  const effective=Math.min(smooth,limit/r-1), arcAngle=90*(1-effective);
  const arc=Math.sin(radians(arcAngle/2))*r*Math.SQRT2;
  const corner=r*Math.tan(radians((90-arcAngle)/4));
  const angle=45*effective, c=corner*Math.cos(radians(angle));
  const d=c*Math.tan(radians(angle)), b=(extent-arc-c-d)/3, a=2*b;
  return `M ${z(width-extent)} 0 c ${z(a)} 0 ${z(a+b)} 0 ${z(a+b+c)} ${z(d)} a ${z(r)} ${z(r)} 0 0 1 ${z(arc)} ${z(arc)} c ${z(d)} ${z(c)} ${z(d)} ${z(b+c)} ${z(d)} ${z(a+b+c)} L ${z(width)} ${z(height-extent)} c 0 ${z(a)} 0 ${z(a+b)} ${z(-d)} ${z(a+b+c)} a ${z(r)} ${z(r)} 0 0 1 ${z(-arc)} ${z(arc)} c ${z(-c)} ${z(d)} ${z(-(b+c))} ${z(d)} ${z(-(a+b+c))} ${z(d)} L ${z(extent)} ${z(height)} c ${z(-a)} 0 ${z(-(a+b))} 0 ${z(-(a+b+c))} ${z(-d)} a ${z(r)} ${z(r)} 0 0 1 ${z(-arc)} ${z(-arc)} c ${z(-d)} ${z(-c)} ${z(-d)} ${z(-(b+c))} ${z(-d)} ${z(-(a+b+c))} L 0 ${z(extent)} c 0 ${z(-a)} 0 ${z(-(a+b))} ${z(d)} ${z(-(a+b+c))} a ${z(r)} ${z(r)} 0 0 1 ${z(arc)} ${z(-arc)} c ${z(c)} ${z(-d)} ${z(b+c)} ${z(-d)} ${z(a+b+c)} ${z(-d)} Z`;
}

// Exact Euclidean distance inside the rasterized smooth-corner outline.
function distanceLine(input,output,sites,bounds,size,weight){
  let k=0;sites[0]=0;bounds[0]=-Infinity;bounds[1]=Infinity;
  for(let q=1;q<size;q++){
    let crossing;
    for(;;){
      const p=sites[k];
      crossing=(input[q]+weight*q*q-(input[p]+weight*p*p))/(2*weight*(q-p));
      if(k>0&&crossing<=bounds[k])k--;else break;
    }
    sites[++k]=q;bounds[k]=crossing;bounds[k+1]=Infinity;
  }
  k=0;
  for(let q=0;q<size;q++){
    while(bounds[k+1]<q)k++;
    const p=sites[k];output[q]=weight*(q-p)*(q-p)+input[p];
  }
}
function inwardDistances(width,height,radius,smoothing,size){
  const padded=size+4, canvas=makeCanvas();canvas.width=padded;canvas.height=padded;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.setTransform(size/width,0,0,size/height,2,2);
  ctx.fillStyle='#fff';ctx.fill(new Path2D(smoothPath(width,height,radius,smoothing)));
  const pixels=ctx.getImageData(0,0,padded,padded).data, field=new Float32Array(padded*padded);
  for(let i=0;i<field.length;i++)field[i]=1e20*(pixels[i*4+3]>127);
  const line=new Float32Array(padded), out=new Float32Array(padded);
  const sites=new Int32Array(padded), bounds=new Float32Array(padded+1);
  for(let x=0;x<padded;x++){
    for(let y=0;y<padded;y++)line[y]=field[y*padded+x];
    distanceLine(line,out,sites,bounds,padded,(height/size)**2);
    for(let y=0;y<padded;y++)field[y*padded+x]=out[y];
  }
  for(let y=0;y<padded;y++){
    for(let x=0;x<padded;x++)line[x]=field[y*padded+x];
    distanceLine(line,out,sites,bounds,padded,(width/size)**2);
    for(let x=0;x<padded;x++)field[y*padded+x]=Math.sqrt(out[x]);
  }
  const result=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)result[y*size+x]=field[(y+2)*padded+x+2];
  return result;
}
function smoothPotential(field,size){
  const values=Float32Array.from(field), temp=new Float32Array(size*size);
  for(let pass=0;pass<2;pass++){
    for(let y=0;y<size;y++){
      const row=y*size;let sum=0;
      for(let k=-2;k<=2;k++)sum+=values[row+clamp(k,0,size-1)];
      for(let x=0;x<size;x++){
        temp[row+x]=sum/5;
        sum+=values[row+Math.min(size-1,x+3)]-values[row+Math.max(0,x-2)];
      }
    }
    for(let x=0;x<size;x++){
      let sum=0;for(let k=-2;k<=2;k++)sum+=temp[clamp(k,0,size-1)*size+x];
      for(let y=0;y<size;y++){
        values[y*size+x]=sum/5;
        sum+=temp[Math.min(size-1,y+3)*size+x]-temp[Math.max(0,y-2)*size+x];
      }
    }
  }
  return values;
}
function quintic(x,width){
  if(width<=0)return Number(x>=0);
  const t=clamp(.5+x/(2*width));return t*t*t*(t*(6*t-15)+10);
}
export function outpaceMap({width,height,radius,depth,scale,mapSize=512,glowStrength=.45,glowSpread=.5,edgeStrength=.6,edgeWidth=2,cornerSmoothing=.6,lightAngle=-25}){
  const size=mapSize, canvas=makeCanvas();canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d'), image=ctx.createImageData(size,size), pixels=image.data;
  const halfW=width/2, halfH=height/2, span=Math.max(Math.min(halfW,halfH),.001), step=span/512;
  const bevel=depth>0?1.5*depth:1e-6, profile=new Float32Array(513);
  for(let i=0;i<=512;i++){const d=i*step;profile[i]=d<bevel?snell[d/bevel*255|0]:0;}
  // Limit compression to avoid a fold when strength increases on a small lens.
  const peak=profile[0]*scale;
  if(scale>0&&peak/.8<=Math.min(span,2*bevel)){
    const slope=.8*step/scale;
    for(let i=1;i<=512;i++)if(profile[i]<profile[i-1]-slope)profile[i]=profile[i-1]-slope;
    for(let i=0;i<=512;i++)if(profile[i]<0)profile[i]=0;
  }
  const distance=inwardDistances(width,height,Math.min(radius,halfW,halfH),cornerSmoothing,size);
  const integrated=new Float32Array(513);let sum=0;
  for(let i=0;i<=512;i++){sum+=profile[i]*step;integrated[i]=sum;}
  const potential=new Float32Array(size*size);
  for(let i=0;i<potential.length;i++)if(distance[i]>0)potential[i]=integrated[distance[i]>=span?512:distance[i]*(512/span)|0];
  const smoothed=smoothPotential(potential,size), dx=width/size,dy=height/size;
  const lx=Math.sin(radians(lightAngle)),ly=-Math.cos(radians(lightAngle));
  const spreadStart=(1-glowSpread)*Math.SQRT2, spread=glowSpread*Math.SQRT2;
  const spreadInv=spread>.001?1/spread:0, edgeInv=edgeWidth>0?1/edgeWidth:0;
  const glowDepth=depth>0?1.6*depth:1e-6, antialias=1.25*Math.max(dx,dy);
  for(let y=0;y<size;y++){
    const py=(y+.5)*dy-halfH;
    for(let x=0;x<size;x++){
      const i=y*size+x,p=i*4,d=distance[i],px=(x+.5)*dx-halfW;
      const left=smoothed[x>0?i-1:i],right=smoothed[x<size-1?i+1:i];
      const top=smoothed[y>0?i-size:i],bottom=smoothed[y<size-1?i+size:i];
      const gx=clamp((right-left)/(2*dx),-.49,.49),gy=clamp((bottom-top)/(2*dy),-.49,.49);
      pixels[p]=(.5+gx)*255+.5|0;pixels[p+1]=(.5+gy)*255+.5|0;pixels[p+3]=255;
      if(d<=0){pixels[p+2]=128;continue;}
      const edgeAA=d>=antialias?1:d/antialias;let light=0;
      if(glowStrength>0){
        const direction=((.5+.5*(clamp(px/halfW,-1,1)*lx+clamp(py/halfH,-1,1)*ly))*Math.SQRT2-spreadStart)*spreadInv;
        light+=glowStrength*Math.pow(clamp(direction),1.5)*quintic(-d+depth,glowDepth);
      }
      if(edgeStrength>0){
        const weight=Math.max(0,1-d*edgeInv);
        if(weight>0){
          const normal=Math.hypot(gx,gy);let reflection=.15;
          if(normal>1e-5){const dot=-gx/normal*lx+-gy/normal*ly;reflection=Math.pow(Math.max(0,dot),1.6)+.55*Math.pow(Math.max(0,-dot),1.6);}
          light+=edgeStrength*weight*reflection;
        }
      }
      pixels[p+2]=127*Math.min(1,light)*edgeAA+128+.5|0;
    }
  }
  ctx.putImageData(image,0,0);return canvas;
}

