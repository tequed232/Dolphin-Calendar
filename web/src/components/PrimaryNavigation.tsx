import {Icon} from './Icon';
import {TABS,type Tab} from '../nav/useNavigation';

export function PrimaryNavigation({active,onSelect}:{active:Tab;onSelect:(tab:Tab)=>void}){
  return <nav className="primary-navigation" aria-label="主要导航">{TABS.map((tab,index)=><button key={tab} type="button" aria-current={active===tab?'page':undefined} onClick={()=>onSelect(tab)}><span className="navigation-icon"><Icon name={tab==='list'?'list':tab==='grid'?'grid':tab} size={24}/></span><span>{['列表','平铺','搜索','设置'][index]}</span></button>)}</nav>;
}
