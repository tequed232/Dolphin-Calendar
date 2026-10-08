import {Children,useEffect,useRef,useState,type PointerEvent,type ReactNode} from 'react';
import '../theme/liquid.css';

const DROP_HEIGHT=64;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const MASK_STEPS=20;
const capsuleCache=new Map<number,{masks:string[];lenses:string[]}>();
function dropShape(width:number,step:number){
 const p=step/MASK_STEPS,x=12-10*p,y=6-5*p;
 return {x,y,radius:Math.min(16+4*p,(width-2*x)/2,(DROP_HEIGHT-2*y)/2)};
}
// 位移贴图只由尺寸决定；页面滚动时由浏览器直接重采样真实背景。
function lensMap(width:number,height:number,radius:number,insetX=0,insetY=0){
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(width/2);canvas.height=Math.ceil(height/2);
  const ctx=canvas.getContext('2d');if(!ctx)return '';
  const pixels=ctx.createImageData(canvas.width,canvas.height),band=Math.min(8,height/8);
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const px=(x+.5)*width/canvas.width-width/2,py=(y+.5)*height/canvas.height-height/2;
    const qx=Math.abs(px)-(width/2-insetX-radius),qy=Math.abs(py)-(height/2-insetY-radius);
    const ox=Math.max(qx,0),oy=Math.max(qy,0),length=Math.hypot(ox,oy);
    const distance=length+Math.min(Math.max(qx,qy),0)-radius;
    const depth=clamp(-distance/band,0,1),bend=distance<=0?Math.sin(depth*Math.PI)*.28:0;
    const nx=length?ox/length:(qx>qy?1:0),ny=length?oy/length:(qy>=qx?1:0),i=(y*canvas.width+x)*4;
    pixels.data[i]=Math.round((.5-Math.sign(px)*nx*bend)*255);
    pixels.data[i+1]=Math.round((.5-Math.sign(py)*ny*bend)*255);
    pixels.data[i+2]=128;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');
}
function getCapsules(width:number){
 let cached=capsuleCache.get(width);if(cached)return cached;
 const masks=Array.from({length:MASK_STEPS+1},(_,step)=>{const {x,y,radius}=dropShape(width,step);return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="64"><rect x="${x}" y="${y}" width="${width-2*x}" height="${64-2*y}" rx="${radius}" fill="white"/></svg>`);});
 const lenses=Array.from({length:MASK_STEPS+1},(_,step)=>{const {x,y,radius}=dropShape(width,step);return lensMap(width,DROP_HEIGHT,radius,x,y);});
 cached={masks,lenses};capsuleCache.set(width,cached);return cached;
}

type Motion={x:number;vx:number;targetX:number;press:number;pressTarget:number;releasePending:boolean;last:number};
type Contact={id:number;startX:number;startY:number;moved:boolean}|null;

export function GlassDock({enabled,distortion,activeIndex,onSelect,children}:{enabled:boolean;distortion:number;activeIndex:number;onSelect:(index:number)=>void|boolean;children:ReactNode}){
  const count=Children.count(children);
  const ref=useRef<HTMLElement>(null),drop=useRef<HTMLDivElement>(null),filterLens=useRef<SVGFEImageElement>(null);
  const [dropMap,setDropMap]=useState(''),[dragging,setDragging]=useState(false);
  const width=useRef(0),height=useRef(76),rect=useRef<DOMRect|null>(null),contact=useRef<Contact>(null),raf=useRef(0),suppressUntil=useRef(0);
  const labels=useRef<HTMLElement[]>([]);
  const motion=useRef<Motion>({x:0,vx:0,targetX:0,press:0,pressTarget:0,releasePending:false,last:0});
  const selected=useRef(activeIndex);selected.current=activeIndex;
  const dropWidth=()=>Math.max(48,Math.min(96,Math.round(width.current/count)-4));
  const center=(index:number)=>width.current*(index+.5)/count;

  function paint(){
    const m=motion.current,node=drop.current,dock=ref.current;if(!node||!dock)return;
    // 背景始终在固定大小的图层内采样。按压只扩大裁切轮廓，绝不缩放背景。
    const capsuleWidth=dropWidth(),capsules=getCapsules(capsuleWidth);node.style.setProperty('--drop-width',`${capsuleWidth}px`);
    const x=clamp(m.x,capsuleWidth/2,width.current-capsuleWidth/2),cy=height.current/2;
    node.style.transform=`translate3d(${x-capsuleWidth/2}px,${cy-DROP_HEIGHT/2}px,0)`;
    const step=Math.round(clamp(m.press,0,1)*MASK_STEPS);
    // 裁切 mask、透镜贴图与高光边界使用相同缓存档位，避免边缘错位。
    const shape=dropShape(capsuleWidth,step);
    node.style.setProperty('--drop-inset-x',`${shape.x}px`);
    node.style.setProperty('--drop-inset-y',`${shape.y}px`);
    node.style.setProperty('--drop-radius',`${shape.radius}px`);
    node.style.setProperty('--drop-press',String(m.press));
    node.style.setProperty('--drop-mask',`url("${capsules.masks[step]}")`);
    if(enabled&&distortion){const lens=capsules.lenses[step];if(filterLens.current?.getAttribute('href')!==lens)filterLens.current?.setAttribute('href',lens);}
    const nearest=clamp(Math.floor(x/(width.current/count)),0,count-1);
    if(dock.dataset.preview!==String(nearest))dock.dataset.preview=String(nearest);
    // 只放大固定按钮里的前景内容；命中范围、背景采样及文字布局保持独立。
    labels.current.forEach((label,index)=>{
      const proximity=Math.exp(-Math.pow((x-center(index))/(width.current/count),2)*2.4);
      const focus=proximity*m.press;
      label.style.transform=`translate3d(0,${-4*focus}px,0) scale(${1+.25*focus})`;
    });
  }
  function step(now:number){
    const m=motion.current,dt=clamp((now-(m.last||now))/1000,.001,.032);m.last=now;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){m.x=m.targetX;m.vx=0;m.press=0;m.releasePending=false;m.last=0;paint();raf.current=0;return;}
    // 欠阻尼弹簧：速度随距离建立，松手后自然越过目标并衰减。
    const stiffness=contact.current?175:330,damping=contact.current?22:23;
    m.vx+=(stiffness*(m.targetX-m.x)-damping*m.vx)*dt;
    m.x+=m.vx*dt;
    // 与参考实现一样，胶囊接近目标后才收起透镜，弹性移动期间保留放大。
    if(m.releasePending&&Math.abs(m.targetX-m.x)<Math.max(2,width.current/count*.025)){m.releasePending=false;m.pressTarget=0;}
    m.press+=(m.pressTarget-m.press)*Math.min(1,dt*18);
    paint();
    const moving=Math.abs(m.targetX-m.x)+Math.abs(m.vx)*.02+Math.abs(m.pressTarget-m.press)*50>0.25;
    if(moving)raf.current=requestAnimationFrame(step);else{m.x=m.targetX;m.vx=0;m.press=m.pressTarget;m.last=0;paint();raf.current=0;}
  }
  function animate(){if(!raf.current)raf.current=requestAnimationFrame(step);}
  useEffect(()=>{
    const node=ref.current;if(!node)return;
    labels.current=Array.from(node.querySelectorAll<HTMLElement>('.dock-content'));
    let size='';const observer=new ResizeObserver(([entry])=>{
      const w=Math.round(entry.contentRect.width),h=Math.round(entry.contentRect.height),key=`${w}:${h}`;
      if(!w||!h||size===key)return;size=key;width.current=w;height.current=h;rect.current=node.getBoundingClientRect();
      const x=center(selected.current),m=motion.current;if(!m.x)m.x=x;m.targetX=x;paint();animate();
      if(enabled&&distortion)setDropMap(getCapsules(dropWidth()).lenses[0]);
    });observer.observe(node);
    return()=>observer.disconnect();
  },[enabled]);
  useEffect(()=>{if(!enabled||!distortion)setDropMap('');else if(width.current)setDropMap(getCapsules(dropWidth()).lenses[0]);},[enabled,distortion]);
  useEffect(()=>{if(!contact.current){const m=motion.current,target=center(activeIndex);if(Math.abs(target-m.x)>8){m.pressTarget=1;m.releasePending=true;}m.targetX=target;animate();}},[activeIndex]);
  useEffect(()=>()=>cancelAnimationFrame(raf.current),[]);
  function pointerDown(e:PointerEvent<HTMLElement>){
    const button=(e.target as Element).closest('button'),index=button?Array.from(ref.current?.querySelectorAll(':scope > button')??[]).indexOf(button):-1;
    if(index<0||contact.current)return;
    rect.current=ref.current!.getBoundingClientRect();
    contact.current={id:e.pointerId,startX:e.clientX,startY:e.clientY,moved:false};
    // Android WebView 会先把触点隐式捕获给 button；立刻交给稳定的 nav，
    // 否则横向滑动时 button 的捕获丢失会中断整个手势。
    ref.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    const m=motion.current,movement=center(index)-m.x;m.targetX=center(index);m.pressTarget=1;m.releasePending=false;
    if(Math.abs(movement)>8)m.vx+=Math.sign(movement)*Math.min(Math.abs(movement)*2.5,420);
    animate();
  }
  function pointerMove(e:PointerEvent<HTMLElement>){
    const c=contact.current,r=rect.current;if(!c||c.id!==e.pointerId||!r)return;
    const dx=e.clientX-c.startX,dy=e.clientY-c.startY;
    if(Math.hypot(dx,dy)>8&&!c.moved)c.moved=true;
    const m=motion.current;m.targetX=clamp(e.clientX-r.left,dropWidth()/2,width.current-dropWidth()/2);
    animate();
  }
  function finish(e:PointerEvent<HTMLElement>,cancel=false){
    const c=contact.current;if(!c||c.id!==e.pointerId)return;
    contact.current=null;setDragging(false);if(ref.current?.hasPointerCapture(e.pointerId))ref.current.releasePointerCapture(e.pointerId);
    const index=cancel?selected.current:clamp(Math.floor(motion.current.targetX/(width.current/count)),0,count-1);
    motion.current.targetX=center(index);motion.current.releasePending=true;animate();
    // 指针捕获后的 click 会落在 nav 上；轻点与滑动都在 pointerup 结算。
    // 键盘激活仍由 button 自己的 onClick 处理。
    if(!cancel){suppressUntil.current=performance.now()+180;const accepted=onSelect(index);if(accepted===false){motion.current.targetX=center(selected.current);motion.current.releasePending=true;animate();}}
  }
  return <><svg className="filter-defs" aria-hidden="true"><defs>
    <filter id="glass-droplet" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB"><feImage ref={filterLens} href={dropMap||undefined} width="100%" height="100%" preserveAspectRatio="none" result="lens"/><feComponentTransfer in="lens" result="centeredLens"><feFuncR type="linear" slope="1" intercept={-.5/255}/><feFuncG type="linear" slope="1" intercept={-.5/255}/></feComponentTransfer><feDisplacementMap in="SourceGraphic" in2="centeredLens" scale={distortion*7} xChannelSelector="R" yChannelSelector="G"/></filter>
  </defs></svg><nav ref={ref} className="dock" aria-label="主导航" data-droplet-ready={!!dropMap} data-dragging={dragging} data-preview={activeIndex} data-count={count} style={{gridTemplateColumns:`repeat(${count},minmax(0,1fr))`}}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>{if(e.target===ref.current)finish(e,true);}}
    onClickCapture={e=>{if(performance.now()<suppressUntil.current){e.preventDefault();e.stopPropagation();suppressUntil.current=0;}}}>
    <div className="dock-motion-layer">
    <div ref={drop} className="dock-droplet" aria-hidden="true"><span className="dock-droplet-clip"><span className="dock-droplet-window"><span className="dock-droplet-glass"/></span></span><span className="dock-droplet-rim"/></div></div>
    {children}
  </nav></>;
}
