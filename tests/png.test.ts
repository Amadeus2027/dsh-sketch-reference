import {describe,expect,it} from 'vitest';
import {validatePng} from '../src/host/service.ts';
import {IMAGE_LIMITS} from '../src/core/limits.ts';

// A real 1x1 PNG. Dimension mutations below test the envelope guard only;
// the DSH attachment service owns complete image decoding and CRC validation.
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
describe('PNG admission boundary',()=>{
 it('accepts a PNG and preserves its bytes',()=>{
  expect(Buffer.from(validatePng(pixel.toString('base64')))).toEqual(pixel);
 });
 it.each(['not base64!','',Buffer.from('plain text').toString('base64')])('rejects invalid image input: %s',encoded=>{
  expect(()=>validatePng(encoded)).toThrow();
 });
 it.each([0,IMAGE_LIMITS.maxDimension+1])('rejects unsupported declared dimensions: %s',dimension=>{
  for(const offset of [16,20]){
   const image=Buffer.from(pixel);image.writeUInt32BE(dimension,offset);
   expect(()=>validatePng(image.toString('base64'))).toThrow(expect.objectContaining({code:'PNG_LIMIT'}));
  }
 });
 it('rejects decoded bytes over the image limit',()=>{
  const oversized=Buffer.alloc(IMAGE_LIMITS.maxBytes+1);pixel.copy(oversized);
  expect(()=>validatePng(oversized.toString('base64'))).toThrow(expect.objectContaining({code:'PNG_LIMIT',status:413}));
 });
});
