import {useEffect} from 'react';

/** Content follows the keyboard's visible area; native navigation reports its own space. */
export function useWindowInsets(){
  useEffect(()=>{
    const root=document.documentElement;
    let frame=0;
    const revealInput=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const input=document.activeElement;
        if(root.dataset.keyboard==='true'&&input instanceof HTMLElement&&input.matches('input,textarea,[contenteditable="true"]'))
          input.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
      });
    };
    window.dolphinInsets=(top,bottom,keyboard=0,height=0)=>{
      root.style.setProperty('--native-top',`${Math.max(0,top)}px`);
      root.style.setProperty('--native-bottom',`${Math.max(0,bottom)}px`);
      root.style.setProperty('--keyboard-height',`${Math.max(0,keyboard)}px`);
      if(height>0)root.style.setProperty('--native-height',`${height}px`);
      root.dataset.keyboard=String(keyboard>0);
      revealInput();
    };
    document.addEventListener('focusin',revealInput);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('focusin',revealInput);delete window.dolphinInsets;};
  },[]);
}
