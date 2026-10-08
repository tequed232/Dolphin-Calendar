export const IMPORT_STEPS=['选择文件','识别格式','解析校验','预览变更','确认导入'] as const;
export function ImportSteps({stage}:{stage:number}){
 return <ol className="import-steps" aria-label="课表导入进度">{IMPORT_STEPS.map((name,index)=><li key={name} data-state={index<stage?'complete':index===stage?'current':'pending'} aria-current={index===stage?'step':undefined}><span aria-hidden="true">{index<stage?'✓':index+1}</span><small>{name}</small><span className="sr-only">{index<stage?'已完成':index===stage?'进行中':'未开始'}</span></li>)}</ol>;
}
