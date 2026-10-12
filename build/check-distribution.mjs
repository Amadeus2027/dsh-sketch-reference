import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

// Publisher check only: installed users never build or install Excalidraw.
const root=resolve(process.argv[2]??fileURLToPath(new URL('../',import.meta.url)));
const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const required=['lib/index.js','lib/client.js','lib/types/index.d.ts','lib/editor/index.html','LICENSE','THIRD_PARTY_NOTICES.md'];
for(const file of required){const info=await stat(join(root,file));if(!info.isFile()||info.size===0)throw Error('Distribution file missing or empty: '+file);}
for(const entry of ['lib','third_party_licenses','THIRD_PARTY_NOTICES.md'])if(!manifest.files.includes(entry))throw Error('Package files must include '+entry);
const html=await readFile(join(root,'lib/editor/index.html'),'utf8');
const assets=[...html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+)"/g)].map(m=>m[1]);
if(assets.length<2)throw Error('Editor JS/CSS entry points are missing');
for(const asset of assets){const path=resolve(root,'lib/editor',asset);if(!path.startsWith(join(root,'lib/editor/assets')+sep)||(await stat(path)).size===0)throw Error('Invalid editor asset: '+asset);}
const fonts=join(root,'lib/editor/fonts');
for(const family of ['Excalifont','Xiaolai','Virgil','Cascadia','Assistant','ComicShanns','Liberation','Lilita','Nunito']){
 const files=await readdir(join(fonts,family));const woff=files.filter(f=>f.endsWith('.woff2'));if(!woff.length)throw Error('Bundled font missing: '+family);
 for(const font of woff)if((await stat(join(fonts,family,font))).size===0)throw Error('Empty bundled font: '+font);
}
for(const file of ['lib/index.js','lib/client.js']){
 const code=await readFile(join(root,file),'utf8');
 if(/(?:from\s*|require\s*\(\s*|import\s*\(\s*)["']@excalidraw\//.test(code))throw Error('Unbundled Excalidraw runtime import: '+file);
}
if(!manifest.dependencies?.zod)throw Error('Host Zod dependency must be installed by the official plugin manager');
console.log('Distribution ready: local editor JS/CSS, 9 font families, host dependency and licenses. No separate Excalidraw installation.');
