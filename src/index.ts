import { fileURLToPath } from 'node:url';
import type {Context} from '@deepseek-ai/cordis';
import {SketchService,type Config} from './host/service.ts';
export {Config} from './host/service.ts';
export default class SketchPlugin extends SketchService {
 constructor(ctx:Context,config:Config){super(ctx,config,fileURLToPath(new URL('./editor/',import.meta.url)));}
}
