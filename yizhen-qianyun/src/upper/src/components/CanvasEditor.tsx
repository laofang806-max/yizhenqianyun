import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { COLOR_META, COLOR_ORDER, type CanvasTool, type ColorAnalysis, type EmbroideryColor, type FrameSize, type PathSet, type PositionMm, type PreviewMode } from "../types/embroidery";
import { editNeedle, type NeedleEdit, type NeedleEditMode, type NeedleSelection } from "../utils/needleEditing";
import { buildThreadPreview } from "../utils/routePreview";
import { getImageSizeMm } from "../utils/coordinateTransform";

type FrameRect = { left: number; top: number; width: number; height: number };
type DragState = { startX: number; startY: number; position: PositionMm; scale: number; rotation: number };

type CanvasEditorProps = {
  showJumpMoves?:boolean;
  threadHex?:string; threadLabel?:string;
  image: HTMLImageElement | null;
  frame: FrameSize;
  position: PositionMm;
  scale: number;
  rotation: number;
  paths: PathSet | null;
  analysis: ColorAnalysis | null;
  visibleColors: Record<EmbroideryColor, boolean>;
  mode: PreviewMode;
  tool: CanvasTool;
  colorOrder: EmbroideryColor[];
  showGrid: boolean;
  viewZoom: number;
  imageOutOfBounds: boolean;
  pathsOutOfBounds: boolean;
  onPositionChange: (position: PositionMm) => void;
  onScaleChange: (scale: number) => void;
  onRotationChange: (rotation: number) => void;
  onDropFile: (file?: File) => void;
  needleMode:NeedleEditMode;
  needleColor:EmbroideryColor;
  needleSelection:NeedleSelection|null;
  onNeedleSelect:(selection:NeedleSelection|null)=>void;
  onNeedleEdit:(edit:NeedleEdit)=>void;
};

function getFrameRect(width: number, height: number, frame: FrameSize): FrameRect {
  const padding = 34;
  const availableWidth = Math.max(0, width - padding * 2);
  const availableHeight = Math.max(0, height - padding * 2);
  const ratio = Math.min(availableWidth / frame.width, availableHeight / frame.height);
  const frameWidth = frame.width * ratio;
  const frameHeight = frame.height * ratio;
  return {
    left: (width - frameWidth) / 2,
    top: (height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
  };
}

export function CanvasEditor({
  showJumpMoves=false,
  threadHex,threadLabel,
  image,
  frame,
  position,
  scale,
  rotation,
  paths,
  analysis,
  visibleColors,
  mode,
  tool,
  colorOrder,
  showGrid,
  viewZoom,
  imageOutOfBounds,
  pathsOutOfBounds,
  onPositionChange,
  onScaleChange,
  onRotationChange,
  onDropFile, needleMode,needleColor,needleSelection,onNeedleSelect,onNeedleEdit,
}: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const needleDragRef=useRef<{selection:NeedleSelection;point:PositionMm}|null>(null);
  const [needleDraft,setNeedleDraft]=useState<{selection:NeedleSelection;point:PositionMm}|null>(null);
  const drawPaths=useMemo(()=>paths&&needleDraft?editNeedle(paths,{kind:"move",...needleDraft}):paths,[paths,needleDraft]);
  const dragRef = useRef<DragState | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 700, height: 430 });
  const frameRect = getFrameRect(canvasSize.width, canvasSize.height, frame);
  const imageSize = image
    ? getImageSizeMm(image.naturalWidth, image.naturalHeight, frame, scale)
    : { width: 0, height: 0 };
  const firstStitchColor = drawPaths
    ? colorOrder.find((color) => drawPaths[color].segments.length > 0)
    : undefined;
  const firstStitch = firstStitchColor
    ? drawPaths?.[firstStitchColor].segments[0]?.end
    : undefined;
  const colorMaskCanvases = useMemo(() => {
    if (!analysis) return null;
    return Object.fromEntries(
      COLOR_ORDER.map((color) => {
        const canvas = document.createElement("canvas");
        canvas.width = analysis.width;
        canvas.height = analysis.height;
        const context = canvas.getContext("2d");
        if (!context) return [color, canvas];
        const imageData = context.createImageData(analysis.width, analysis.height);
        const pixels = analysis.masks[color].data;
        const [red, green, blue] = color==="black"&&threadHex ? [parseInt(threadHex.slice(1,3),16),parseInt(threadHex.slice(3,5),16),parseInt(threadHex.slice(5,7),16)] : COLOR_META[color].rgb;
        for (let pixel = 0; pixel < pixels.length; pixel += 1) {
          if (!pixels[pixel]) continue;
          const offset = pixel * 4;
          imageData.data[offset] = red;
          imageData.data[offset + 1] = green;
          imageData.data[offset + 2] = blue;
          imageData.data[offset + 3] = 210;
        }
        context.putImageData(imageData, 0, 0);
        return [color, canvas];
      }),
    );
  }, [analysis,threadHex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const observer = new ResizeObserver(([entry]) => {
      setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(canvasSize.width * ratio);
    const pixelHeight = Math.round(canvasSize.height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    context.setTransform(
      ratio * viewZoom,
      0,
      0,
      ratio * viewZoom,
      ratio * centerX * (1 - viewZoom),
      ratio * centerY * (1 - viewZoom),
    );
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    context.fillStyle = "#f0f1eb";
    context.fillRect(0, 0, canvasSize.width, canvasSize.height);
    if (!frameRect.width || !frameRect.height) return;

    context.fillStyle = "#fffefa";
    context.fillRect(frameRect.left, frameRect.top, frameRect.width, frameRect.height);

    context.save();
    context.beginPath();
    context.rect(frameRect.left, frameRect.top, frameRect.width, frameRect.height);
    context.clip();

    context.strokeStyle = "rgba(73, 110, 95, 0.30)";
    context.lineWidth = 1;
    context.setLineDash([5, 4]);
    context.beginPath();
    context.moveTo(frameRect.left + frameRect.width / 2, frameRect.top);
    context.lineTo(frameRect.left + frameRect.width / 2, frameRect.top + frameRect.height);
    context.moveTo(frameRect.left, frameRect.top + frameRect.height / 2);
    context.lineTo(frameRect.left + frameRect.width, frameRect.top + frameRect.height / 2);
    context.stroke();
    context.setLineDash([]);

    if (mode === "original" && image) {
      const imageCenterX = frameRect.left + frameRect.width / 2 + (position.x / frame.width) * frameRect.width;
      const imageCenterY = frameRect.top + frameRect.height / 2 + (position.y / frame.height) * frameRect.height;
      const drawWidth = (imageSize.width / frame.width) * frameRect.width;
      const drawHeight = (imageSize.height / frame.height) * frameRect.height;
      context.save();
      context.translate(imageCenterX, imageCenterY);
      context.rotate((rotation * Math.PI) / 180);
      context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

      if (colorMaskCanvases) {
        const enabledColors = COLOR_ORDER.filter((color) => visibleColors[color]).length;
        if (enabledColors > 0 && enabledColors < COLOR_ORDER.length) {
          context.fillStyle = "rgba(7, 21, 42, 0.66)";
          context.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        }
        for (const color of colorOrder) {
          if (visibleColors[color]) {
            context.drawImage(
              colorMaskCanvases[color],
              -drawWidth / 2,
              -drawHeight / 2,
              drawWidth,
              drawHeight,
            );
          }
        }
      }
      context.restore();
    }

    if ((mode === "path" || needleMode !== "off") && drawPaths) {
      context.lineWidth = 1.25 / viewZoom;
      context.lineCap = "round";
      context.lineJoin = "round";
      const px=(p:PositionMm)=>frameRect.left+p.x/frame.width*frameRect.width;
      const py=(p:PositionMm)=>frameRect.top+p.y/frame.height*frameRect.height;
      for (const color of colorOrder) {
        if (!visibleColors[color]) continue;
        const route=buildThreadPreview(drawPaths[color]);
        context.save();
        context.setLineDash([]);
        context.strokeStyle=(color==="black"&&threadHex?threadHex:COLOR_META[color].hex);
        if(showJumpMoves){
          for(const link of route.links){
            context.strokeStyle=link.trim?"#929ba1":(color==="black"&&threadHex?threadHex:COLOR_META[color].hex);
            context.setLineDash(link.trim?[4/viewZoom,4/viewZoom]:[]);
            context.beginPath();context.moveTo(px(link.from),py(link.from));
            context.lineTo(px(link.to),py(link.to));context.stroke();
          }
          context.setLineDash([]);
        }else{
        context.beginPath();
        route.needlePoints.forEach((point,index)=>{
          if(index===0) context.moveTo(px(point),py(point));
          else context.lineTo(px(point),py(point));
        });
        context.stroke();
        }
        context.fillStyle=(color==="black"&&threadHex?threadHex:COLOR_META[color].hex);
        // Draw dots last, above the route. Every dot corresponds to one real S action.
        const dotRadius=Math.min(2.8,Math.max(1,frameRect.width/Math.sqrt(Math.max(1,route.needlePoints.length))/6));
        const painted=new Set<string>();
        for(const p of route.needlePoints) {
          const key=`${p.x},${p.y}`;if(painted.has(key))continue;painted.add(key);
          context.beginPath();context.arc(px(p),py(p),dotRadius/viewZoom,0,Math.PI*2);context.fill();
        }
        context.restore();
      }
      if(needleSelection) {
        const point=drawPaths[needleSelection.color].segments[needleSelection.index]?.end;
        if(point){context.beginPath();context.arc(px(point),py(point),6/viewZoom,0,Math.PI*2);context.strokeStyle="#00a4d6";context.lineWidth=2/viewZoom;context.stroke();}
      }
    }

    if (showGrid) {
      const spacing = 10;
      context.strokeStyle = "rgba(42, 64, 85, 0.20)";
      context.lineWidth = 0.7;
      for (let x = 0; x <= frame.width; x += spacing) {
        const pixelX = frameRect.left + (x / frame.width) * frameRect.width;
        context.beginPath();
        context.moveTo(pixelX, frameRect.top);
        context.lineTo(pixelX, frameRect.top + frameRect.height);
        context.stroke();
      }
      for (let y = 0; y <= frame.height; y += spacing) {
        const pixelY = frameRect.top + (y / frame.height) * frameRect.height;
        context.beginPath();
        context.moveTo(frameRect.left, pixelY);
        context.lineTo(frameRect.left + frameRect.width, pixelY);
        context.stroke();
      }
    }

    context.restore();

    const overflow = mode === "path" ? pathsOutOfBounds : imageOutOfBounds;
    context.strokeStyle = overflow ? "#ffb52e" : "#648678";
    context.lineWidth = overflow ? 2.5 : 2;
    context.strokeRect(frameRect.left + 1, frameRect.top + 1, frameRect.width - 2, frameRect.height - 2);

    const needleX = frameRect.left + frameRect.width / 2;
    const needleY = frameRect.top + frameRect.height / 2;
    context.fillStyle = "#ff414b";
    context.beginPath();
    context.arc(needleX, needleY, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(needleX, needleY, 7.5, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "rgba(240, 65, 75, 0.7)";
    context.setLineDash([3, 3]);
    context.beginPath();
    context.moveTo(needleX, needleY + 9);
    context.lineTo(needleX, frameRect.top + frameRect.height);
    context.stroke();
    context.setLineDash([]);

    if (firstStitch && firstStitchColor &&
      firstStitch.x >= 0 && firstStitch.x <= frame.width &&
      firstStitch.y >= 0 && firstStitch.y <= frame.height) {
      const markerX = frameRect.left + (firstStitch.x / frame.width) * frameRect.width;
      const markerY = frameRect.top + (firstStitch.y / frame.height) * frameRect.height;
      const markerRadius = 8 / viewZoom;
      const label = `首针 ${threadLabel??COLOR_META[firstStitchColor].label}`;
      const labelX = markerX + 13 / viewZoom;
      const labelY = markerY + 12 / viewZoom;
      context.save();
      context.lineWidth = 2 / viewZoom;
      context.strokeStyle = "#17212b";
      context.fillStyle = "#ffd84d";
      context.beginPath();
      context.arc(markerX, markerY, markerRadius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = "#17212b";
      context.beginPath();
      context.arc(markerX, markerY, 2 / viewZoom, 0, Math.PI * 2);
      context.fill();
      context.font = `600 ${10 / viewZoom}px sans-serif`;
      const labelWidth = context.measureText(label).width + 10 / viewZoom;
      context.fillStyle = "rgba(9, 26, 48, 0.94)";
      context.fillRect(labelX, labelY, labelWidth, 18 / viewZoom);
      context.strokeStyle = "#ffd84d";
      context.lineWidth = 1 / viewZoom;
      context.strokeRect(labelX, labelY, labelWidth, 18 / viewZoom);
      context.fillStyle = "#ffffff";
      context.textBaseline = "middle";
      context.fillText(label, labelX + 5 / viewZoom, labelY + 9 / viewZoom);
      context.restore();
    }
  }, [
    canvasSize,
    colorMaskCanvases,
    colorOrder,
    frame,
    frameRect.height,
    frameRect.left,
    frameRect.top,
    frameRect.width,
    firstStitch,
    firstStitchColor,
    image,
    imageOutOfBounds,
    imageSize.height,
    imageSize.width,
    mode,
    paths, drawPaths, needleMode, needleSelection, showJumpMoves,
    pathsOutOfBounds,
    position.x,
    position.y,
    rotation,
    scale,
    showGrid,
    viewZoom,
    threadHex,threadLabel,visibleColors,
  ]);

  const pointerPosition = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const screenX = event.clientX - bounds.left;
    const screenY = event.clientY - bounds.top;
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;
    return {
      x: (screenX - centerX) / viewZoom + centerX,
      y: (screenY - centerY) / viewZoom + centerY,
    };
  };

  const framePosition=(pointer:PositionMm):PositionMm=>({x:(pointer.x-frameRect.left)/frameRect.width*frame.width,y:(pointer.y-frameRect.top)/frameRect.height*frame.height});
  const hitNeedle=(pointer:PositionMm):NeedleSelection|null=>{
    if(!paths)return null;
    let best=11/viewZoom,result:NeedleSelection|null=null;
    for(const color of colorOrder)if(visibleColors[color])paths[color].segments.forEach((segment,index)=>{
      const x=frameRect.left+segment.end.x/frame.width*frameRect.width,y=frameRect.top+segment.end.y/frame.height*frameRect.height;
      const d=Math.hypot(pointer.x-x,pointer.y-y);
      if(d<best){best=d;result={color,index};}
    });
    return result;
  };
  const finishPointer=()=>{
    const draft=needleDragRef.current;
    const original=draft&&paths?.[draft.selection.color].segments[draft.selection.index]?.end;
    if(draft&&original&&(draft.point.x!==original.x||draft.point.y!==original.y))onNeedleEdit({kind:"move",...draft});
    needleDragRef.current=null;setNeedleDraft(null);dragRef.current=null;
  };
  const cancelPointer=()=>{needleDragRef.current=null;setNeedleDraft(null);dragRef.current=null;};
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerPosition(event);
    if (
      pointer.x < frameRect.left ||
      pointer.x > frameRect.left + frameRect.width ||
      pointer.y < frameRect.top ||
      pointer.y > frameRect.top + frameRect.height
    ) return;

    if(needleMode!=="off"&&paths) {
      const hit=hitNeedle(pointer),point=framePosition(pointer);
      if(needleMode==="add") {
        const color=needleSelection?.color??needleColor;
        let after=needleSelection?.index??-1;
        if(!needleSelection) {
          let best=Infinity;
          paths[color].segments.forEach((segment,index)=>{
            const a=segment.start,b=segment.end,dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
            const t=len?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/len)):0;
            const d=Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
            if(d<best){best=d;after=index-1;}
          });
        }
        onNeedleEdit({kind:"add",color,after,point});return;
      }
      onNeedleSelect(hit);
      if(!hit)return;
      if(needleMode==="delete"){onNeedleEdit({kind:"delete",selection:hit});return;}
      needleDragRef.current={selection:hit,point:paths[hit.color].segments[hit.index].end};
      event.currentTarget.setPointerCapture(event.pointerId);return;
    }

    if (tool === "move" && image) {
      const imageCenterX = frameRect.left + frameRect.width / 2 + (position.x / frame.width) * frameRect.width;
      const imageCenterY = frameRect.top + frameRect.height / 2 + (position.y / frame.height) * frameRect.height;
      const deltaX = pointer.x - imageCenterX;
      const deltaY = pointer.y - imageCenterY;
      const radians = (-rotation * Math.PI) / 180;
      const localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians);
      const localY = deltaX * Math.sin(radians) + deltaY * Math.cos(radians);
      const halfWidth = (imageSize.width / frame.width) * frameRect.width / 2;
      const halfHeight = (imageSize.height / frame.height) * frameRect.height / 2;
      if (Math.abs(localX) > halfWidth || Math.abs(localY) > halfHeight) return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: pointer.x,
      startY: pointer.y,
      position,
      scale,
      rotation,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if(needleDragRef.current){
      const draft={selection:needleDragRef.current.selection,point:framePosition(pointerPosition(event))};
      needleDragRef.current=draft;setNeedleDraft(draft);return;
    }
    if (!dragRef.current) return;
    const pointer = pointerPosition(event);
    const deltaX = pointer.x - dragRef.current.startX;
    const deltaY = pointer.y - dragRef.current.startY;

    if (tool === "move") {
      onPositionChange({
        x: dragRef.current.position.x + (deltaX / frameRect.width) * frame.width,
        y: dragRef.current.position.y + (deltaY / frameRect.height) * frame.height,
      });
    } else if (tool === "zoom") {
      onScaleChange(Math.min(3, Math.max(0.1, dragRef.current.scale * Math.exp(-deltaY * 0.008))));
    } else {
      onRotationChange(((dragRef.current.rotation + deltaX * 0.65 + 180) % 360) - 180);
    }
  };

  const onWheel = useCallback((event: WheelEvent) => {
    if (!image) return;
    event.preventDefault();
    if(needleMode!=="off")return;
    onScaleChange(Math.min(3, Math.max(0.1, scale * (event.deltaY < 0 ? 1.06 : 0.94))));
  }, [image, onScaleChange, scale, needleMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  return (
    <div
      className="canvas-stage"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropFile(event.dataTransfer.files[0]);
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="刺绣画框与图案路径编辑画布"
        className={image ? `editor-canvas tool-${needleMode!=="off"?"needle-"+needleMode:tool}` : "editor-canvas"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={cancelPointer}
        onLostPointerCapture={cancelPointer}
      />
      {!image && (
        <div className="canvas-empty">
          <span>＋</span>
          <strong>上传图片开始定位</strong>
          <small>拖放 PNG / JPG / JPEG / BMP 到画布</small>
        </div>
      )}
      {(imageOutOfBounds || (mode === "path" && pathsOutOfBounds)) && (
        <div className="canvas-warnings">
          {imageOutOfBounds && <div className="canvas-warning" role="status"><span>⚠</span>框外落针点自动忽略，不会上传</div>}
          {mode === "path" && pathsOutOfBounds && <div className="canvas-warning" role="status"><span>⚠</span>路径超出画框范围</div>}
        </div>
      )}
      <div className="needle-label"><i /> 固定针</div>
      {mode === "path" && !paths && <div className="path-empty-overlay">生成刺绣路径后在此预览</div>}
    </div>
  );
}
