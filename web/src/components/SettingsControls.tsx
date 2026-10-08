import {Children,isValidElement,type ReactNode} from 'react';
import {ChoiceSelect} from './ChoiceSelect';
import {Icon,type IconName} from './Icon';
export function Toggle({label,description,value,onChange,id}:{label:string;description?:string;value:boolean;onChange:(v:boolean)=>void;id:string}){return <label className="setting-row" htmlFor={id}><span><strong>{label}</strong>{description&&<small>{description}</small>}</span><input id={id} className="switch" type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/></label>;}
export function Select({label,children,value,onChange}:{label:string;children:ReactNode;value:string|number;onChange:(v:string)=>void}){
  const options=Children.toArray(children).filter(isValidElement).map(option=>{const props=option.props as {value:string|number;children:ReactNode};return {value:String(props.value),label:props.children};});
  return <ChoiceSelect label={label} value={value} options={options} onChange={onChange}/>;
}
export function LinkRow({title,detail,onClick,icon='chevron'}:{title:string;detail?:string;onClick:()=>void;icon?:IconName}){return <button className="setting-row link-row" onClick={onClick}><span><strong>{title}</strong>{detail&&<small>{detail}</small>}</span><Icon name={icon}/></button>;}
