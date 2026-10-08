export type Course = { id: string; name: string; teacher: string; room: string; day: number; start: number; end: number; weeks: number[]; color: string; notes: string; temporary?: boolean; specificDate?: string };
export type RestTime = { label: string; start: string; end: string };
export type Period = { start: string; end: string; label?: string; breakAfter?: RestTime };
export type Schedule = { term: { name: string; startDate: string; weeks: number }; periods: Period[]; courses: Course[]; importNotes?: string[] };
export type Book = { title: string; publisher: string; edition: string; cover?: string; text: string; source: 'manual' | 'camera' | 'album' | 'builtin' };
export type BackgroundImage = {url:string;name:string;width:number;height:number;sourceWidth:number;sourceHeight:number};
export type HolidayKind = 'rest'|'makeup'|'festival';
export type HolidayDay = {date:string;kind:HolidayKind;title:string;source:string};
export type HolidayCalendar = {id:string;displayName:string;isSuggested:boolean};
export type HolidayRange = {from:string;to:string;calendarIds:string[]};
export type Settings = {
  autoUpdate:boolean; directDownload:boolean; timetableMode?: 'list'|'grid'; showTimes?:boolean; showCurrentTimeLine?:boolean;
  mode: 'system' | 'light' | 'dark'; scale: number; showNavigation: boolean; showWeekend: boolean; firstDay: number; holidayMarkers:boolean;
  topAuto: boolean; bottomAuto: boolean; topInset: number; bottomInset: number;
  glass: boolean; glassMode:'off'|'partial'|'full'; dispersion: number; scattering: number; distortion: number; backgroundEnabled:boolean; backgroundBlur:number; performance: 'auto' | 'high';
  notificationsEnabled:boolean; reminders: boolean; advance: number; journeyLive: boolean; pet: boolean; poke: boolean; lines: string; school: string; map: 'amap' | 'baidu'; dynamicColor: boolean;
};
export type AppData = { schema: 1; appearanceRevision: 2; schedule: Schedule; books: Record<string, Book>; settings: Settings; background?:BackgroundImage; onboarded: boolean; holidays:HolidayDay[];holidayCalendarIds:string[];holidaySourceNames:string[];holidayRanges:HolidayRange[] };
export const PALETTE = ['sage', 'lavender', 'peach', 'blue', 'rose'];
export const DEFAULT_PERIODS: Period[] = [
  ['08:00','08:45'],['08:55','09:40'],['10:00','10:45'],['10:55','11:40'],
  ['14:00','14:45'],['14:55','15:40'],['16:00','16:45'],['16:55','17:40'],['19:00','19:45'],['19:55','20:40'],['20:50','21:35'],['21:45','22:30']
].map(([start,end]) => ({start,end}));
export function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function parseDate(value: string) { const [y,m,d] = value.split('-').map(Number); return new Date(y,m-1,d,12); }
export function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate()+days); return next; }
export function monday(date: Date) { return addDays(date, -((date.getDay()+6)%7)); }
export function weekOf(date: Date, start: string) { const a = parseDate(dateKey(date)), b = monday(parseDate(start)); return Math.floor(Math.round((a.getTime()-b.getTime())/86400000)/7)+1; }
export function coursesOn(schedule: Schedule, date: Date) { const w = weekOf(date,schedule.term.startDate); return schedule.courses.filter(c => c.start>=1&&c.end<=schedule.periods.length&&(c.specificDate ? c.specificDate===dateKey(date) : c.day === ((date.getDay()+6)%7)+1 && c.weeks.includes(w))).sort((a,b)=>a.start-b.start); }
export function courseDates(course: Course, schedule: Schedule) { if(course.specificDate)return [course.specificDate]; const base = monday(parseDate(schedule.term.startDate)); return course.weeks.map(w=>dateKey(addDays(base,(w-1)*7+course.day-1))); }
export function compactWeeks(values: number[]) {
  const a = [...new Set(values)].sort((x,y)=>x-y), out: string[] = [];
  for(let i=0;i<a.length;i++) { let j=i; while(a[j+1]===a[j]+1) j++; out.push(j===i?`${a[i]}`:`${a[i]}-${a[j]}`); i=j; } return out.join(';');
}
export function coursePeriod(course:Course,schedule:Schedule){const first=schedule.periods[course.start-1]?.label,last=schedule.periods[course.end-1]?.label;return first?(course.start===course.end?`${first} 节`:`${first} 至 ${last??course.end} 节`):`${course.start}–${course.end} 节`;}
export function initialData(): AppData {
  const startDate = dateKey(monday(new Date()));
  return { schema: 1, appearanceRevision: 2, schedule: {term:{name:'我的新学期',startDate,weeks:20}, periods:DEFAULT_PERIODS,courses:[]},books:{},onboarded:false,holidays:[],holidayCalendarIds:[],holidaySourceNames:[],holidayRanges:[],
    settings: {timetableMode:'list',showTimes:true,showCurrentTimeLine:true,autoUpdate:true,directDownload:false,mode:'system',scale:1,showNavigation:true,showWeekend:true,firstDay:1,holidayMarkers:false,topAuto:true,bottomAuto:true,topInset:24,bottomInset:20,glass:true,glassMode:'partial',dispersion:1,scattering:1,distortion:1,backgroundEnabled:false,backgroundBlur:12,performance:'auto',notificationsEnabled:true,reminders:false,advance:10,journeyLive:true,pet:false,poke:true,lines:'下一站，知识的海洋。\n带好教材，我们出发吧！',school:'',map:'amap',dynamicColor:false} };
}
export function sampleSchedule(): Schedule {
  const base=initialData().schedule;
  return {...base,term:{...base.term,name:'秋日学期 · 示例'},courses:[
    {name:'高等数学',teacher:'陈老师',room:'博学楼 A203',day:1,start:1,end:2,color:'sage'},
    {name:'大学英语',teacher:'林老师',room:'明德楼 B106',day:1,start:5,end:6,color:'lavender'},
    {name:'设计与生活',teacher:'王老师',room:'艺术楼 302',day:2,start:3,end:4,color:'peach'},
    {name:'程序设计基础',teacher:'李老师',room:'实验楼 405',day:2,start:5,end:6,color:'blue'},
    {name:'线性代数',teacher:'周老师',room:'博学楼 A201',day:3,start:1,end:2,color:'lavender'},
    {name:'大学体育',teacher:'刘老师',room:'东区体育场',day:4,start:7,end:8,color:'sage'},
    {name:'大学英语',teacher:'林老师',room:'明德楼 B106',day:5,start:3,end:4,color:'rose'}
  ].map((c,i)=>({...c,id:`sample-${i}`,weeks:Array.from({length:20},(_,j)=>j+1),notes:''}))};
}
