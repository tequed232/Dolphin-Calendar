import {useState} from 'react';

/** User initiated closes are guarded; successful saves can call onDiscard directly. */
export function useDiscardGuard(dirty:boolean,onDiscard:()=>void,blocked=false) {
  const [confirming,setConfirming]=useState(false);
  return {
    confirming,
    requestClose(){if(blocked)return;if(dirty)setConfirming(true);else onDiscard();},
    continueEditing(){if(!blocked)setConfirming(false);},
    discard(){if(blocked)return;setConfirming(false);onDiscard();}
  };
}
