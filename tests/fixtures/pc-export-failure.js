// Test-installed HTML only, never loaded by production. A visible explicit arm
// button fails exactly one native PNG export, and DOM counters aid verification.
let armed=false,exports=0,failures=0;
const original=HTMLCanvasElement.prototype.toBlob;
HTMLCanvasElement.prototype.toBlob=function(...args){
 document.documentElement.dataset.testPngExports=String(++exports);
 if(armed){armed=false;document.documentElement.dataset.testPngFailures=String(++failures);throw Error('测试注入：PNG 导出失败');}
 return original.apply(this,args);
};
window.addEventListener('DOMContentLoaded',()=>{
 const button=document.createElement('button');button.textContent='测试：下次 PNG 失败';
 button.style.cssText='position:fixed;top:4px;right:110px;z-index:10000;font-size:10px';
 button.onclick=()=>{armed=true;};document.body.append(button);
});
