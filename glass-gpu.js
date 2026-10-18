/* One shared GPU surface. The two calibrated optical models keep their original
 * sampling order; the 9x9 box average is separated into 9x1 and 1x9 GPU passes. */
const vertex=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`;
const header=`#version 300 es
precision highp float;
uniform vec2 uSize;
uniform float uDpr;
out vec4 color;
vec2 point(){return vec2(gl_FragCoord.x/uDpr,uSize.y-gl_FragCoord.y/uDpr);}
vec2 frameUV(vec2 p){return vec2(p.x/uSize.x,1.-p.y/uSize.y);}
`;
const sceneFragment=header+`
uniform sampler2D tPhoto,tFactor,tOffset,tNoise,tDots,tPaper,tHaze;
uniform vec4 uTone,uMotion;
uniform vec4 uOpacity;
vec3 softLight(vec3 b,vec3 s,float alpha){
 vec3 d=mix(((16.*b-12.)*b+4.)*b,sqrt(max(b,vec3(0.))),step(vec3(.25),b));
 vec3 c=mix(b-(1.-2.*s)*b*(1.-b),b+(2.*s-1.)*(d-b),step(vec3(.5),s));
 return mix(b,c,alpha);
}
void main(){
 vec2 p=point(),uv=p/uSize;
 vec2 photo=(p-uSize*.5-uMotion.zw)/uMotion.xy+uSize*.5;
 vec3 b=texture(tPhoto,(photo+64.)/(uSize+128.)).rgb;
 vec4 dot=texture(tDots,p/4.);b*=mix(vec3(1.),dot.rgb,dot.a*uOpacity.x);
 vec4 noise=texture(tNoise,p/230.);b=softLight(b,noise.rgb,noise.a*uOpacity.y);
 b=softLight(b,uTone.rgb,uTone.a);
 if(uOpacity.z>0.){vec4 haze=texture(tHaze,uv);b=1.-(1.-b)*(1.-haze.rgb*haze.a*uOpacity.z);}
 if(uOpacity.w>0.){vec4 paper=texture(tPaper,p/420.);b=softLight(b,paper.rgb,paper.a*uOpacity.w);}
 b=b*texture(tFactor,uv).rgb+texture(tOffset,uv).rgb;
 color=vec4(clamp(b,0.,1.),1.);
}`;
const blurFragment=header+`
uniform sampler2D tSource;
uniform vec2 uStep;
void main(){vec2 uv=frameUV(point());vec3 sum=vec3(0.);for(int i=-4;i<=4;i++)sum+=texture(tSource,uv+float(i)*uStep).rgb;color=vec4(sum/9.,1.);}`;
const lensFragment=header+`
uniform sampler2D tScene,tSoft,tMap,tMask;
uniform vec4 uRect;
uniform float uScale,uStrength,uHighlight,uChroma;
uniform int uKind;
vec3 sampleScene(vec2 p){return texture(tScene,frameUV(p)).rgb;}
vec3 channels(vec2 p,vec2 delta,bool soft){
 vec2 r=p+delta*(1.+.2*uChroma),g=p+delta*(1.+.1*uChroma),b=p+delta;
 if(soft)return vec3(texture(tSoft,frameUV(r)).r,texture(tSoft,frameUV(g)).g,texture(tSoft,frameUV(b)).b);
 if(uChroma==0.)return sampleScene(b);
 return vec3(sampleScene(r).r,sampleScene(g).g,sampleScene(b).b);
}
vec3 outpace(vec2 p){
 vec2 uv=(p-uRect.xy)/uRect.zw;
 vec4 map=texture(tMap,uv);
 if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))map=vec4(vec3(128./255.),1.);
 vec3 b=channels(p,(map.rg-.5)*uScale,false);
 return clamp(b+max(0.,map.b-128./255.)*uHighlight,0.,1.);
}
void main(){
 vec2 p=point(),uv=(p-uRect.xy)/uRect.zw;
 if(uKind==0){
  vec3 sum=vec3(0.);
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
   float wx=x==0?.786986:.106507,wy=y==0?.786986:.106507;
   sum+=outpace(p+vec2(x,y))*wx*wy;
  }
  color=vec4(sum,texture(tMask,uv).a);
 }else{
  vec2 delta=p-(uRect.xy+uRect.zw*.5),d=delta/(uRect.zw*.5);
  float box=pow(abs(d.x),6.)+pow(abs(d.y),6.);
  float r1=clamp((1.-box)*8.,0.,1.);
  float r2=clamp((.955-box*.95)*16.,0.,1.)-clamp((.91-box*.95)*16.,0.,1.);
  float r3=clamp((1.5-box*1.1)*2.,0.,1.)-clamp((1.-box*1.1)*2.,0.,1.);
  float dy=-delta.y/uSize.y;
  float light=clamp((clamp(dy,0.,.2)+.1)/2.,0.,1.)+clamp((clamp(-dy,-1000.,.2)*r3+.1)/2.,0.,1.);
  vec3 b=channels(p,-delta*box*.22*uStrength,true);
  vec3 lit=clamp(b+(r1*light+r2*.3)*uHighlight,0.,1.);
  float t=smoothstep(0.,1.,clamp(r1+r2,0.,1.)),outside=(1.-t)*(1.-t),alpha=t+outside;
  color=vec4((lit*t+sampleScene(p)*outside)/max(alpha,.001),alpha);
 }
}`;

export class GlassGPU{
 constructor(canvas){
  this.canvas=canvas;const gl=this.gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,stencil:false});
  if(!gl)throw Error('WebGL2 unavailable');
  this.parallel=gl.getExtension('KHR_parallel_shader_compile');
  this.programs=[sceneFragment,blurFragment,lensFragment].map(source=>this.program(source));
  this.textures={};this.buffers=[];this.float=!!gl.getExtension('EXT_color_buffer_float');
 }
 program(source){
  const gl=this.gl,program=gl.createProgram();
  for(const [type,text] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,source]]){const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);gl.attachShader(program,s);gl.deleteShader(s);}
  gl.linkProgram(program);return {program,uniforms:{}};
 }
 async ready(){
  const gl=this.gl;
  if(this.parallel)while(this.programs.some(p=>!gl.getProgramParameter(p.program,this.parallel.COMPLETION_STATUS_KHR)))await new Promise(resolve=>setTimeout(resolve,8));
  for(const p of this.programs){
   if(!gl.getProgramParameter(p.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p.program));
   for(let i=0;i<gl.getProgramParameter(p.program,gl.ACTIVE_UNIFORMS);i++){const info=gl.getActiveUniform(p.program,i);p.uniforms[info.name]=gl.getUniformLocation(p.program,info.name);}
  }
 }
 texture(bitmap,repeat=false){
  const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);bitmap.close();return t;
 }
 setScene(bitmaps){
  for(const [name,bitmap] of Object.entries(bitmaps)){if(this.textures[name])this.gl.deleteTexture(this.textures[name]);this.textures[name]=this.texture(bitmap,['noise','dots','paper'].includes(name));}
 }
 resize(width,height,dpr){
  if(this.width===width&&this.height===height&&this.dpr===dpr)return;
  const gl=this.gl;this.width=width;this.height=height;this.dpr=dpr;
  this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(height*dpr);
  for(const b of this.buffers){gl.deleteFramebuffer(b.fbo);gl.deleteTexture(b.texture);}this.buffers=[];
  for(let i=0;i<3;i++){
   const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,this.float?gl.RGBA16F:gl.RGBA,this.canvas.width,this.canvas.height,0,gl.RGBA,this.float?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
   const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);this.buffers.push({texture,fbo});
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 bind(program,textures){const gl=this.gl;gl.useProgram(program.program);gl.uniform2f(program.uniforms.uSize,this.width,this.height);gl.uniform1f(program.uniforms.uDpr,this.dpr);let unit=0;for(const [name,texture] of Object.entries(textures)){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(program.uniforms[name],unit++);}}
 region(r,pad=0){const d=this.dpr,x=Math.max(0,Math.floor((r.x-pad)*d)),y=Math.max(0,Math.floor((this.height-r.y-r.height-pad)*d)),right=Math.min(this.canvas.width,Math.ceil((r.x+r.width+pad)*d)),top=Math.min(this.canvas.height,Math.ceil((this.height-r.y+pad)*d));this.gl.scissor(x,y,Math.max(0,right-x),Math.max(0,top-y));}
 union(entries){const x=Math.min(...entries.map(e=>e.rect.x)),y=Math.min(...entries.map(e=>e.rect.y));return {x,y,width:Math.max(...entries.map(e=>e.rect.x+e.rect.width))-x,height:Math.max(...entries.map(e=>e.rect.y+e.rect.height))-y};}
 render(entries,settings,config,motion){
  if(!entries.length){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);return;}
  if(!this.textures.photo)return;
  const gl=this.gl,[scene,blur,lens]=this.programs,[base,horizontal,soft]=this.buffers;
  gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.disable(gl.BLEND);gl.enable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER,base.fbo);this.region(this.union(entries),40);
  this.bind(scene,Object.fromEntries(Object.entries(this.textures).map(([key,t])=>['t'+key[0].toUpperCase()+key.slice(1),t])));
  gl.uniform4fv(scene.uniforms.uTone,config.tone);gl.uniform4f(scene.uniforms.uOpacity,config.dots.opacity,config.noise.opacity,config.haze.opacity,config.paper.opacity);gl.uniform4fv(scene.uniforms.uMotion,motion);gl.drawArrays(gl.TRIANGLES,0,3);
  const cards=entries.filter(e=>e.type==='card');
  if(cards.length){
   const box=this.union(cards);this.region(box,36);
   gl.bindFramebuffer(gl.FRAMEBUFFER,horizontal.fbo);this.bind(blur,{tSource:base.texture});gl.uniform2f(blur.uniforms.uStep,1.2/this.width,0);gl.drawArrays(gl.TRIANGLES,0,3);
   gl.bindFramebuffer(gl.FRAMEBUFFER,soft.fbo);this.bind(blur,{tSource:horizontal.texture});gl.uniform2f(blur.uniforms.uStep,0,1.2/this.height);gl.drawArrays(gl.TRIANGLES,0,3);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.SCISSOR_TEST);
  for(const entry of entries){
   if(entry.type!=='card'&&!entry.map)continue;
   const r=entry.rect;this.region(r);
   this.bind(lens,{tScene:base.texture,tSoft:soft.texture,tMap:entry.map?.map||base.texture,tMask:entry.map?.mask||base.texture});
   gl.uniform4f(lens.uniforms.uRect,r.x,r.y,r.width,r.height);gl.uniform1i(lens.uniforms.uKind,entry.type==='card'?1:0);gl.uniform1f(lens.uniforms.uScale,Math.min(12,r.height*.4)*1.6*settings.strength/38);gl.uniform1f(lens.uniforms.uStrength,settings.strength/38);gl.uniform1f(lens.uniforms.uHighlight,settings.highlight/30);gl.uniform1f(lens.uniforms.uChroma,settings.dispersion/100);gl.drawArrays(gl.TRIANGLES,0,3);
  }
  gl.disable(gl.SCISSOR_TEST);
 }
}
