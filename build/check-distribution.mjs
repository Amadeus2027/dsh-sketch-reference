import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

function imports(code,file){
 const found=[];
 const visit=node=>{
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))found.push(node.moduleSpecifier.text);
  if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))&&node.arguments[0]&&(ts.isStringLiteral(node.arguments[0])||ts.isNoSubstitutionTemplateLiteral(node.arguments[0])))found.push(node.arguments[0].text);
  ts.forEachChild(node,visit);
 };
 visit(ts.createSourceFile(file,code,ts.ScriptTarget.Latest,false,ts.ScriptKind.JS));return found;
}
async function editorScripts(directory){
 const files=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())files.push(...await editorScripts(path));else if(entry.isFile()&&entry.name.endsWith('.js'))files.push(path);}return files;
}

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
 if(imports(code,file).some(spec=>/^@(?:excalidraw|xyflow)\//.test(spec)))throw Error('Unbundled editor runtime import: '+file);
}
for(const file of await editorScripts(join(root,'lib/editor/assets'))){
 const bare=imports(await readFile(file,'utf8'),file).find(spec=>!spec.startsWith('.')&&!spec.startsWith('/')&&!/^[a-z][a-z\d+.-]*:/i.test(spec));
 if(bare)throw Error(`Unbundled editor runtime bare import ${JSON.stringify(bare)}: ${file}`);
}
if(!manifest.dependencies?.zod)throw Error('Host Zod dependency must be installed by the official plugin manager');
console.log('Distribution ready: local editor JS/CSS, 9 font families, host dependency and licenses. No separate Excalidraw installation.');
