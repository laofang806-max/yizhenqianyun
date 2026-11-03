import { buildThreadPreview } from "../utils/routePreview";
import { COLOR_META, type EmbroideryColor, type PathSet } from "../types/embroidery";

type PathPreviewProps = {
  showJumpMoves?:boolean;
  threadHex?:string; threadLabel?:string;
  paths: PathSet | null;
  frameWidth: number;
  frameHeight: number;
  visibleColors: Record<EmbroideryColor, boolean>;
  colorOrder: EmbroideryColor[];
  mode: "original" | "path";
  onModeChange: (mode: "original" | "path") => void;
};

export function PathPreview({
  showJumpMoves=false,
  threadHex,threadLabel,
  paths,
  frameWidth,
  frameHeight,
  visibleColors,
  colorOrder,
  mode,
  onModeChange,
}: PathPreviewProps) {
  return (
    <section className="preview-panel">
      <div className="preview-heading">
        <span>路径预览</span>
        <div className="segmented-control">
          <button type="button" className={mode === "original" ? "selected" : ""} onClick={() => onModeChange("original")}>原图</button>
          <button type="button" className={mode === "path" ? "selected" : ""} onClick={() => onModeChange("path")}>路径</button>
        </div>
        {!paths && <small>生成后查看四色绣线路径</small>}
      </div>
      <p className="path-route-legend"><span>{showJumpMoves?"━ 落针路线 · ┄ 抬针空走":"━ 同色一根线（含待剪连线）"}</span><span>● 落针</span></p>
      <p className="thread-route-help">{showJumpMoves?"虚线段不落针；机器不自动剪线，残留浮线可剪除。":"实线按落针顺序连接，跨图案连线可按需要剪除。"}</p>
      <div className={`preview-grid ${threadHex?"single-thread-preview":""}`}>
        {(threadHex ? ["black" as const] : colorOrder).map((color) => (
          <div className={`preview-tile ${visibleColors[color] ? "" : "preview-disabled"}`} key={color}>
            <div className="tile-heading"><i style={{ backgroundColor: (color==="black"&&threadHex?threadHex:COLOR_META[color].hex) }} />{threadLabel??COLOR_META[color].label}路径</div>
            <svg viewBox="0 0 150 112" role="img" aria-label={`${COLOR_META[color].label}刺绣路径预览`} preserveAspectRatio="none">
              {paths && (() => {
                const route=buildThreadPreview(paths[color]);
                const x=(v:number)=>v/frameWidth*150,y=(v:number)=>v/frameHeight*112;
                const thread=route.needlePoints.map((point,index)=>`${index===0 ? "M" : "L"}${x(point.x)},${y(point.y)}`).join("");
                const dots=[...new Map(route.needlePoints.map(p=>[`${p.x},${p.y}`,p])).values()];
                return <>
                  {showJumpMoves?route.links.map((link,i)=><path key={i} d={`M${x(link.from.x)},${y(link.from.y)}L${x(link.to.x)},${y(link.to.y)}`} fill="none" stroke={link.trim?"#929ba1":(color==="black"&&threadHex?threadHex:COLOR_META[color].hex)} strokeWidth=".7" strokeDasharray={link.trim?"2 2":undefined}/>):<path d={thread} fill="none" stroke={(color==="black"&&threadHex?threadHex:COLOR_META[color].hex)} strokeWidth=".7" strokeLinecap="round" strokeLinejoin="round" />}
                  {dots.map((p,i)=><circle key={i} cx={x(p.x)} cy={y(p.y)} r={route.needlePoints.length>600 ? .5 : 1.35} fill={(color==="black"&&threadHex?threadHex:COLOR_META[color].hex)} />)}
                </>;
              })()}
              {paths && paths[color].segments.length === 0 && (
                <text x="75" y="58" textAnchor="middle" className="tile-empty">暂无识别路径</text>
              )}
              {!paths && <text x="75" y="58" textAnchor="middle" className="tile-empty">等待生成路径</text>}
            </svg>
            {paths && <div className="tile-meta">{paths[color].segments.length} 针迹 · {buildThreadPreview(paths[color]).lengthMm.toFixed(1)} mm 线迹 · {buildThreadPreview(paths[color]).trimCount} 处跨轮廓连线</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
