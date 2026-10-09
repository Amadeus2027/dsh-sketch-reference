import {AttachmentId,type ImageAttachmentRef} from '@deepseek-ai/dsh-attachment';
import {imageRefSchema} from '../core/visual.ts';

// Same public reference reconstruction pattern as DSH tool-fs/read-image (MIT).
export function imageValue(value:unknown){
 const {name,originalDimensions,...image}=imageRefSchema.parse(value);
 return {...image,...(name===undefined?{}:{name}),...(originalDimensions===undefined?{}:{originalDimensions})};
}
export function imageReference(value:unknown):ImageAttachmentRef{
 const image=imageValue(value);return {...image,attachmentId:AttachmentId(image.attachmentId)};
}
