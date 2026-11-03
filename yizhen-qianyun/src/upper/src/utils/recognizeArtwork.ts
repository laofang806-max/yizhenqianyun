import fullRoute from "../data/bird-route.json";
export type RegisteredImageRoute = { width: number; height: number; needlePoints: number[][] };
export async function recognizeArtwork(image: HTMLImageElement, signal: AbortSignal): Promise<RegisteredImageRoute | null> {
  const ratio = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法读取图像。");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const response = await fetch("/api/artwork/recognize", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: canvas.toDataURL("image/jpeg", .88).split(",")[1] }), signal,
  });
  if (!response.ok) throw new Error("自动识别暂不可用，可点击生成路径重试。");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("matched" in result) || result.matched !== true) return null;
  if (!("homography" in result) || !Array.isArray(result.homography) || result.homography.length !== 9
    || !result.homography.every(value => typeof value === "number" && Number.isFinite(value))) throw new Error("图像定位结果无效。");
  const h = result.homography as number[];
  const points = fullRoute.needlePoints.map(([x, y]) => {
    const u=x/fullRoute.width,v=y/fullRoute.height,z=h[6]*u+h[7]*v+h[8];
    if (z<=1e-7) throw new Error("图像投影无效，请重新拍摄完整图案。");
    return [(h[0]*u+h[1]*v+h[2])/z*image.naturalWidth,(h[3]*u+h[4]*v+h[5])/z*image.naturalHeight];
  });
  const inside=points.filter(([x,y])=>x>=0&&y>=0&&x<=image.naturalWidth&&y<=image.naturalHeight).length;
  if(inside<points.length*.98) return null;
  return {width:image.naturalWidth,height:image.naturalHeight,needlePoints:points};
}
