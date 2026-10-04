import {createRoot} from 'react-dom/client';
import './components/elements';
import './theme/app.css';
import './theme/background.css';
import './theme/calendar.css';
import './theme/holiday.css';
import './theme/page-structure.css';
import './theme/experience.css';
import {AppProvider} from './state/AppState';
import {App} from './App';
createRoot(document.getElementById('root')!).render(<AppProvider><App/></AppProvider>);
// APK 已打包全部资源，不注册网页离线缓存，避免覆盖安装后旧缓存截住新构建。
if(window.Dolphin) navigator.serviceWorker?.getRegistrations().then(registrations=>{for(const registration of registrations)void registration.unregister();}).catch(()=>{});
else if(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')navigator.serviceWorker?.register('./sw.js').catch(()=>{});
