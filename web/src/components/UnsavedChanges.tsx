import {Dialog} from './Dialog';
import '../theme/editor-experience.css';

export function UnsavedChanges({open,busy=false,onContinue,onDiscard,onSave}:{open:boolean;busy?:boolean;onContinue:()=>void;onDiscard:()=>void;onSave?:()=>void}) {
  return <Dialog open={open} title="修改还未保存" onClose={onContinue}>
    <p className="muted">刚才的修改还没有保存。你可以继续编辑，或保存后离开。</p>
    <div className="unsaved-actions">
      {onSave&&<button className="primary full" disabled={busy} onClick={onSave}>{busy?'正在保存…':'保存并关闭'}</button>}
      <button className="secondary full" disabled={busy} onClick={onContinue}>继续编辑</button>
      <button className="text-button danger full" disabled={busy} onClick={onDiscard}>放弃修改</button>
    </div>
  </Dialog>;
}
