import { buildThreadPreview } from "../utils/routePreview";
import { Info } from "lucide-react";
import { COLOR_META, COLOR_ORDER, type EmbroideryColor, type PathSet } from "../types/embroidery";

type StatisticsPanelProps = {
  paths: PathSet | null;
  threadHex?:string;threadLabel?:string;
  regions: Record<EmbroideryColor, number>;
  colorOrder: EmbroideryColor[];
};

export function StatisticsPanel({ paths, regions, colorOrder,threadHex,threadLabel }: StatisticsPanelProps) {
  const totalPoints = paths
    ? COLOR_ORDER.reduce((total, color) => total + paths[color].segments.length, 0)
    : 0;
  const totalLength = paths
    ? COLOR_ORDER.reduce((total, color) => total + buildThreadPreview(paths[color]).lengthMm, 0)
    : 0;

  return (
    <section className="panel statistics-panel">
      <div className="panel-title">路径统计 <Info size={12} className="info-icon" /></div>
      <div className="statistics-table">
        <div className="statistics-row statistics-header">
          <span>颜色</span><span>区域数量</span><span>落针数</span><span>线迹长度</span>
        </div>
        {(threadHex?["black" as const]:colorOrder).map((color) => (
          <div className="statistics-row" key={color}>
            <span className="statistics-color"><i style={{ background: threadHex??COLOR_META[color].hex }} />{threadLabel??COLOR_META[color].label}</span>
            <span>{paths ? regions[color] : "—"}</span>
            <span>{paths ? paths[color].segments.length : "—"}</span>
            <span>{paths ? `${buildThreadPreview(paths[color]).lengthMm.toFixed(1)} mm` : "—"}</span>
          </div>
        ))}
        <div className="statistics-row statistics-total">
          <span>总计</span><span>{paths ? COLOR_ORDER.reduce((total, color) => total + regions[color], 0) : "—"}</span>
          <span>{paths ? totalPoints : "—"}</span><span>{paths ? `${totalLength.toFixed(1)} mm` : "—"}</span>
        </div>
      </div>
      {!paths && <p className="empty-statistics">生成路径后显示识别与路径统计</p>}
    </section>
  );
}
