import {addDays} from '../lib/model';

const weekend=(date:Date)=>date.getDay()===0||date.getDay()===6;
/** Move by visible days; the first date retains the existing strip anchor. */
export function visibleDate(date:Date,offset:number,showWeekend:boolean){
 if(showWeekend)return addDays(date,offset);
 let result=new Date(date),remaining=Math.abs(offset),direction=Math.sign(offset);
 while(remaining){result=addDays(result,direction);if(!weekend(result))remaining--;}
 return result;
}
/** Build each date from its neighbour instead of recounting every prior day. */
export function dateStripWindow(start:Date,length:number,showWeekend:boolean){
 const dates:Date[]=[];let day=new Date(start);
 for(let i=0;i<length;i++){
  if(i)day=visibleDate(day,1,showWeekend);
  dates.push(day);
 }
 return dates;
}
