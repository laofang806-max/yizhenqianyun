import { Info } from "lucide-react";
import { COLOR_META, COLOR_ORDER, type EmbroideryColor } from "../types/embroidery";

type ColorPanelProps = {
  activeColors: Record<EmbroideryColor, boolean>;
  regions: Record<EmbroideryColor, number>;
  hasAnalysis: boolean;
  imageUrl: string;
  onToggleColor: (color: EmbroideryColor, enabled: boolean) => void;
  onToggleAll: (enabled: boolean) => void;
};

export function ColorPanel({
  activeColors,
  regions,
  hasAnalysis,
  imageUrl,
  onToggleColor,
  onToggleAll,
}: ColorPanelProps) {
  const allEnabled = COLOR_ORDER.every((color) => activeColors[color]);
  return (
    <section className="panel color-panel">
      <div className="panel-title">颜色控制 <Info size={12} className="info-icon" /></div>
      <div className="color-panel-body">
        <div className="color-options">
          {COLOR_ORDER.map((color) => (
            <label key={color} className="color-option">
              <input
                type="checkbox"
                checked={activeColors[color]}
                onChange={(event) => onToggleColor(color, event.target.checked)}
              />
              <span className="color-swatch" style={{ backgroundColor: COLOR_META[color].hex }} />
              <span>{COLOR_META[color].label}</span>
              {hasAnalysis && <small>{regions[color]} 区域</small>}
            </label>
          ))}
          <label className="color-option all-colors-option">
            <input
              type="checkbox"
              checked={allEnabled}
              onChange={(event) => onToggleAll(event.target.checked)}
            />
            <span className="all-swatch" />
            <span>显示全部</span>
          </label>
        </div>
        <div className="color-thumbnail">
          {imageUrl ? <img src={imageUrl} alt="上传图案预览" /> : <span>图片预览</span>}
        </div>
      </div>
      {hasAnalysis && <p className="detection-note">识别黑、红、黄、蓝四种颜色</p>}
    </section>
  );
}
