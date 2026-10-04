import type {BackgroundImage} from '../lib/model';
import {DEFAULT_BACKGROUND_URL} from '../lib/defaultBackground';
export function AppBackground({image,enabled}:{image?:BackgroundImage;enabled:boolean}){
  const custom=!!image&&enabled,url=custom?image.url:DEFAULT_BACKGROUND_URL;
  return <div className="app-background" aria-hidden="true" data-image="true" data-source={custom?'custom':'default'}>
    <div className="background-photo" style={{backgroundImage:`url("${url}")`}}/><div className="background-veil"/>
  </div>;
}
