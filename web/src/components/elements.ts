import type { DetailedHTMLProps, HTMLAttributes } from 'react';
export class MdDialog extends HTMLElement {
  show(){const dialog=this.querySelector('dialog');if(dialog&&!dialog.open) dialog.showModal();}
  close(){this.querySelector('dialog')?.close();}
}
if(!customElements.get('md-dialog')) customElements.define('md-dialog',MdDialog);
if(!customElements.get('md-card')) customElements.define('md-card',class extends HTMLElement{});
declare module 'react' { namespace JSX { interface IntrinsicElements {
  'md-dialog':DetailedHTMLProps<HTMLAttributes<MdDialog>,MdDialog>;
  'md-card':DetailedHTMLProps<HTMLAttributes<HTMLElement>,HTMLElement>;
} } }
