import butterflyRoute from '../data/butterfly-route.json';
import rabbitRoute from '../data/rabbit-route.json';
import taijiRoute from '../data/taiji-route.json';
import fullRoute from '../data/bird-route.json';
import soloRoute from '../data/solo-bird-route.json';
import flowerRoute from '../data/flower-route.json';

export type ArtworkPresetKey='full'|'solo'|'flower'|'taiji'|'rabbit'|'butterfly';
export const ARTWORK_PRESETS={
 butterfly:{label:'蝴蝶',imageUrl:new URL('../assets/butterfly-original.png',import.meta.url).href,fileName:'蝴蝶.png',mimeType:'image/png',scale:.9,position:butterflyRoute.summary.defaultPositionMm,needleCount:butterflyRoute.needlePoints.length},
 rabbit:{label:'兔子',imageUrl:new URL('../assets/rabbit-original.png',import.meta.url).href,fileName:'兔子.png',mimeType:'image/png',scale:.72,needleCount:rabbitRoute.needlePoints.length},
 taiji:{label:'太极',imageUrl:new URL('../assets/taiji-original.svg',import.meta.url).href,fileName:'太极60mm.svg',mimeType:'image/svg+xml',scale:2/3,needleCount:taijiRoute.needlePoints.length},
 full:{label:'花鸟',imageUrl:new URL('../assets/bird-original.jpg',import.meta.url).href,fileName:'花鸟.jpg',mimeType:'image/jpeg',scale:.85,needleCount:fullRoute.needlePoints.length},
 solo:{label:'鸟',imageUrl:new URL('../assets/solo-bird.png',import.meta.url).href,fileName:'鸟.png',mimeType:'image/png',scale:.7,needleCount:soloRoute.needlePoints.length},
 flower:{label:'花',imageUrl:new URL('../assets/flower-original.png',import.meta.url).href,fileName:'花.png',mimeType:'image/png',scale:.85,needleCount:flowerRoute.needlePoints.length},
} as const;
export function resolvePromptPreset(prompt:string):ArtworkPresetKey|null {
 const exact=prompt.trim();
 if(/蝴蝶|butterfly/i.test(exact))return 'butterfly';
 if(/兔子|小兔|兔兔|rabbit|bunny/i.test(exact))return 'rabbit';
 if(exact==='太极'||exact==='太极图'||exact==='太极6cm'||exact==='太极60mm')return 'taiji';
 if(exact==='花鸟')return 'full';
 if(exact==='鸟')return 'solo';
 if(exact==='花')return 'flower';
 return null;
}
