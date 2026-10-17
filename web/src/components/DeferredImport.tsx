import {Component,lazy,Suspense,type ComponentProps,type ReactNode} from 'react';

const Import=lazy(()=>import('../screens/Import').then(module=>({default:module.Import})));
class ImportBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div className="empty-card" role="alert"><h2>导入页面暂时无法打开</h2><p>已保存的课表保留在本机。请重新打开应用后再试。</p><button className="primary" onClick={()=>location.reload()}>重新打开</button></div>:this.props.children;}
}
/** Spreadsheet parsing is only downloaded when the import task is opened. */
export function DeferredImport(props:ComponentProps<typeof import('../screens/Import').Import>){
 return <ImportBoundary><Suspense fallback={<p className="load-note" role="status">正在准备导入页面…</p>}><Import {...props}/></Suspense></ImportBoundary>;
}
