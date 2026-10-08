import '@excalidraw/excalidraw/index.css';
import {createRoot} from 'react-dom/client';
import './index.css';
(globalThis as {EXCALIDRAW_ASSET_PATH?:string}).EXCALIDRAW_ASSET_PATH='/sketch-reference-assets/';
const sessionId=new URLSearchParams(location.search).get('sessionId');
void import('./App.tsx').then(({SketchApp})=>{
 const root=createRoot(document.getElementById('root')!);
 if(sessionId)root.render(<SketchApp sessionId={sessionId}/>);
 else root.render(<main>请从 Harness 会话内打开手绘参考板。</main>);
});
