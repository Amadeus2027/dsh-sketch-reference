import type {Drawing} from './contracts.ts';

/** Excalidraw line/arrow points are local to x/y, before the element rotation.
 * Width/height alone lose the sign and bends of a path. Never copy arbitrary
 * element metadata or a whole freehand stroke into a model request. */
export function linearGeometry(element:Drawing['scene']['elements'][number]) {
 if((element.type!=='line'&&element.type!=='arrow')||!element.points)return {};
 const points=element.points.slice(0,32).map(([x,y])=>[x,y] as [number,number]);
 // General Excalidraw rotation uses an element-specific centre, not x/y.
 // Supply derived scene points only where a pure translation is exact.
 return {points,pointsTruncated:element.points.length>32,...(!(element.angle??0)?{scenePoints:points.map(([x,y])=>[element.x+x,element.y+y] as [number,number])}:{scenePointsUnavailable:'rotated' as const})};
}
