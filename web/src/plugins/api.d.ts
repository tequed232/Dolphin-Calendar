/** Dolphin Calendar Plugin API v1. Available only inside the managed plugin iframe. */
export interface PluginCourse {id:string;name:string;teacher:string;room:string;day:number;start:number;end:number;weeks:number[];color:string;notes:string;temporary?:boolean;specificDate?:string}
export interface PluginPeriod {start:string;end:string;label?:string;breakAfter?:{label:string;start:string;end:string}}
export interface PluginSchedule {term:{name:string;startDate:string;weeks:number};periods:PluginPeriod[];courses:PluginCourse[];importNotes?:string[]}
export interface PluginTheme {mode:'light'|'dark';tokens:Record<string,string>}
export interface PluginContext extends PluginTheme {date:string;schedule?:PluginSchedule}
export interface DolphinPluginAPI {
 ready():Promise<PluginContext>;
 getContext():Promise<PluginContext>;
 getTheme():Promise<PluginTheme>;
 getSchedule():Promise<PluginSchedule>;
 getCourses(date?:string):Promise<PluginCourse[]>;
 selectDate(date:string):Promise<null>;
 openCourse(courseId:string):Promise<null>;
 requestImport(json:string|object):Promise<{previewRequested:true}>;
 loadData():Promise<unknown|null>;
 saveData(value:unknown):Promise<null>;
 onContext(callback:(context:PluginContext)=>void):()=>void;
}

declare global {
 interface Window {
  /** Injected only into the managed plugin iframe, never into the application host. */
  readonly DolphinPlugin:DolphinPluginAPI;
 }
}
