import '@excalidraw/excalidraw/index.css';
import {createRoot} from 'react-dom/client';
import './index.css';
import {startBridge} from './bridge.ts';
import {initializeAppearance} from './appearance.ts';
initializeAppearance();
(globalThis as {EXCALIDRAW_ASSET_PATH?:string}).EXCALIDRAW_ASSET_PATH='/sketch-reference-assets/';
const sessionId=new URLSearchParams(location.search).get('sessionId');
void import('./App.tsx').then(({SketchApp})=>{
 const root=createRoot(document.getElementById('root')!);
 if(sessionId)root.render(<SketchApp sessionId={sessionId}/>);
 else root.render(<main>请从 Harness 会话内打开手绘参考板。</main>);
}).catch(()=>{startBridge();document.getElementById('root')!.textContent='画板组件加载失败，请关闭后重开；服务器草稿仍保留。';});
