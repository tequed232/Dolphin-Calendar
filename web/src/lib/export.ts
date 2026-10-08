import {isNative,native} from './native';
export function exportText(name:string,text:string,mime='application/json'){
 if(isNative()){native('export',{text,name,mime});return;}
 const url=URL.createObjectURL(new Blob([text],{type:mime})),link=document.createElement('a');
 link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
