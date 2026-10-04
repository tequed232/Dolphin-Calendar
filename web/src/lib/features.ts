import type {Settings} from './model';

// 三档材质仍保留在独立实验版本；稳定版本暂时隐藏模式选择。
export const SHOW_GLASS_MODE_SETTINGS=false;

// 仅调整当前渲染，不覆盖用户保存的偏好；旧版关闭设置仍然生效。
export function effectiveGlassMode(mode:Settings['glassMode']):Settings['glassMode']{
  return SHOW_GLASS_MODE_SETTINGS||mode==='off'?mode:'partial';
}
