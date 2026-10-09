import {useEffect,useId,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {MdDialog} from './elements';
import {Icon} from './Icon';
export function Dialog({open,onClose,title,children,wide=false}:{open:boolean;onClose:()=>void;title:string;children:ReactNode;wide?:boolean}){
  const ref=useRef<MdDialog>(null),close=useRef(onClose),programmatic=useRef(false),titleId=useId();close.current=onClose;
  useEffect(()=>{const dialog=ref.current!.querySelector('dialog')!;
    const request=()=>close.current(),cancel=(event:Event)=>{event.preventDefault();request();};
    const closed=()=>{if(programmatic.current)programmatic.current=false;else request();};
    dialog.addEventListener('dolphin-close-request',request);dialog.addEventListener('cancel',cancel);dialog.addEventListener('close',closed);
    return()=>{dialog.removeEventListener('dolphin-close-request',request);dialog.removeEventListener('cancel',cancel);dialog.removeEventListener('close',closed);};},[]);
  // React 19 对自定义元素的属性赋值不能替代 showModal；关闭事件只同步状态，绝不重开。
  useEffect(()=>{if(open) ref.current?.show();else if(ref.current?.querySelector('dialog')?.open){programmatic.current=true;ref.current.close();}},[open]);
  // Top-layer dialogs must not inherit a page's CSS zoom or clipped scrolling container.
  return createPortal(<md-dialog ref={ref}><dialog aria-labelledby={titleId} className={wide?'wide':''} onClick={e=>{if(e.target===e.currentTarget){const box=e.currentTarget.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)onClose();}}}><div className="dialog-content"><header className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="关闭对话框" onClick={onClose}><Icon name="close"/></button></header>{children}</div></dialog></md-dialog>,document.body);
}
