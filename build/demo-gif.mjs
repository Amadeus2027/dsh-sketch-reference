import {spawnSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';

// Recording/README tooling only; ffmpeg is not a plugin runtime dependency.
if(process.argv.length!==4)throw Error('Usage: node build/demo-gif.mjs original-recording.mp4 output.gif');
const source=resolve(process.argv[2]),output=resolve(process.argv[3]);
const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',source],{encoding:'utf8'});
if(probe.status!==0)throw Error('ffprobe failed; install FFmpeg on the recording machine and use the original screen capture.');
const duration=Number(JSON.parse(probe.stdout).format.duration);if(!Number.isFinite(duration)||duration<=0)throw Error('Invalid recording duration');
await mkdir(dirname(output),{recursive:true});
const filter="fps=8,scale=w='min(1040,iw)':h=-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle";
const encode=spawnSync('ffmpeg',['-nostdin','-v','error','-y','-i',source,'-filter_complex',filter,'-loop','0',output],{stdio:'inherit'});
if(encode.status!==0)throw Error('GIF conversion failed');
const hash=createHash('sha256');for await(const chunk of createReadStream(source))hash.update(chunk);
await writeFile(output+'.json',JSON.stringify({sourceSha256:hash.digest('hex'),sourceDurationSeconds:duration,playbackSpeed:1,fps:8,maxWidth:1040,transformations:['downscale','frame resampling','palette quantization'],cuts:0,syntheticFrames:0,modelEvidence:'Must be documented separately; conversion does not prove real model execution.'},null,2)+'\n');
console.log('GIF and source provenance written. No cuts, acceleration or synthesized UI.');
