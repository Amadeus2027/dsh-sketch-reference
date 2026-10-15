// Documentation tooling: sampled real browser frames, with explicit segment cuts.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const [timelinePath,outputPath,prefix]=process.argv.slice(2);
if(!timelinePath||!outputPath||!prefix)throw Error('Usage: node build/graph-demo-gif.mjs timeline.json output.gif segment-prefix');
const timeline=resolve(timelinePath),output=resolve(outputPath),root=dirname(timeline);
const segments=JSON.parse(await readFile(timeline,'utf8')).filter(s=>prefix==='graph'?!s.label.startsWith('site-'):s.label.startsWith(prefix));
if(!segments.length)throw Error('No selected segments');
await mkdir(dirname(output),{recursive:true});
const concat=[],sources=[];
for(const segment of segments){
 const frames=[];
 for(let i=0;i<segment.frames.length;i++){
  const frame=segment.frames[i],path=join(root,frame.file),duration=(segment.frames[i+1]?.t??segment.duration)-frame.t;
  if(duration<=0)throw Error('Invalid frame timing');
  concat.push(`file '${path.replaceAll('\\','/').replaceAll("'","'\\''")}'`,`duration ${duration.toFixed(6)}`);
  frames.push({file:frame.file,t:frame.t,duration,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
 }
 sources.push({label:segment.label,duration:segment.duration,frames});
}
const last=join(root,segments.at(-1).frames.at(-1).file).replaceAll('\\','/');concat.push(`file '${last}'`);
const list=join(root,`${prefix}-concat.txt`);await writeFile(list,concat.join('\n')+'\n');
const filter="fps=4,scale=w='min(1280,iw)':h=-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle";
const result=spawnSync('ffmpeg',['-nostdin','-v','error','-y','-f','concat','-safe','0','-i',list,'-filter_complex',filter,'-loop','0',output],{stdio:'inherit'});
if(result.status!==0)throw Error('GIF encoding failed');
await writeFile(output+'.json',JSON.stringify({capture:'Actual Edge browser screenshots during automated UI actions; approximately 4 fps, not OS video capture.',editing:'Selected segments joined in capture order; tool-call gaps and waits omitted. UI transitions between segments are cuts. No claim of continuous recording or model speed.',playbackSpeedWithinSegments:1,fps:4,maxWidth:1280,syntheticFrames:0,overlaidUiOrResponses:false,segments:sources,gifSha256:createHash('sha256').update(await readFile(output)).digest('hex')},null,2)+'\n');
console.log('Wrote edited GIF and actual-frame provenance:',output);
