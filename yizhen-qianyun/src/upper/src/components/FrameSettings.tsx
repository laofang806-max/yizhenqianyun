import { Move, RotateCw, ZoomIn } from "lucide-react";
import type { CanvasTool, FrameSize, PositionMm } from "../types/embroidery";
import { useEffect, useState } from "react";

type FrameSettingsProps = {
  frame: FrameSize;
  position: PositionMm;
  scale: number;
  rotation: number;
  tolerance: number;
  tool: CanvasTool;
  disabled: boolean;
  onFrameChange: (frame: FrameSize) => void;
  onPositionChange: (position: PositionMm) => void;
  onScaleChange: (scale: number) => void;
  onRotationChange: (rotation: number) => void;
  onToleranceChange: (tolerance: number) => void;
  onToolChange: (tool: CanvasTool) => void;
};

function NumberInput({
  label,
  value,
  unit,
  disabled,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <label className="setting-field">
      <span>{label}</span>
      <span className="setting-input">
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            const nextDraft = event.target.value;
            setDraft(nextDraft);
            const next = Number(nextDraft);
            if (
              nextDraft.trim() &&
              Number.isFinite(next) &&
              (min === undefined || next >= min) &&
              (max === undefined || next <= max)
            ) {
              onChange(next);
            }
          }}
          onBlur={() => {
            let next = Number(draft);
            if (!draft.trim() || !Number.isFinite(next)) next = value;
            if (min !== undefined) next = Math.max(min, next);
            if (max !== undefined) next = Math.min(max, next);
            onChange(next);
            setDraft(String(Number(next.toFixed(step < 1 ? 1 : 0))));
          }}
        />
        <small>{unit}</small>
      </span>
    </label>
  );
}

export function FrameSettings({
  frame,
  position,
  scale,
  rotation,
  tolerance,
  tool,
  disabled,
  onFrameChange,
  onPositionChange,
  onScaleChange,
  onRotationChange,
  onToleranceChange,
  onToolChange,
}: FrameSettingsProps) {
  return (
    <section className="panel settings-panel">
      <div className="panel-title">⌘ <span>画框设置</span><span className="panel-chevron">⌃</span></div>
      <div className="settings-grid frame-grid">
        <NumberInput label="画框宽度" value={frame.width} unit="mm" min={30} max={1000} onChange={(width) => onFrameChange({ ...frame, width })} />
        <NumberInput label="画框高度" value={frame.height} unit="mm" min={30} max={1000} onChange={(height) => onFrameChange({ ...frame, height })} />
      </div>
      <div className="settings-divider" />
      <div className="section-subtitle">图片定位</div>
      <div className="settings-grid">
        <NumberInput label="X 位置" value={Number(position.x.toFixed(1))} unit="mm" disabled={disabled} step={0.1} onChange={(x) => onPositionChange({ ...position, x })} />
        <NumberInput label="Y 位置" value={Number(position.y.toFixed(1))} unit="mm" disabled={disabled} step={0.1} onChange={(y) => onPositionChange({ ...position, y })} />
      </div>
      <div className="setting-range-row">
        <label htmlFor="image-scale">缩放</label>
        <input id="image-scale" aria-label="图片缩放" type="range" min="10" max="300" step="0.1" value={Number((scale * 100).toFixed(1))} disabled={disabled} onChange={(event) => onScaleChange(Number(event.target.value) / 100)} />
        <span>{Number((scale * 100).toFixed(1))} <small>%</small></span>
      </div>
      <div className="settings-grid rotation-row">
        <NumberInput label="旋转" value={Number(rotation.toFixed(1))} unit="°" disabled={disabled} min={-180} max={180} step={1} onChange={onRotationChange} />
        <NumberInput label="颜色容差" value={tolerance} unit="°" disabled={disabled} min={0} max={60} onChange={onToleranceChange} />
      </div>
      <div className="tool-row">
        <span className="tool-buttons" role="group" aria-label="画布操作工具">
          <button type="button" disabled={disabled} className={tool === "move" ? "active" : ""} onClick={() => onToolChange("move")}><Move size={15} /><span>拖动</span></button>
          <button type="button" disabled={disabled} className={tool === "zoom" ? "active" : ""} onClick={() => onToolChange("zoom")}><ZoomIn size={15} /><span>缩放</span></button>
          <button type="button" disabled={disabled} className={tool === "rotate" ? "active" : ""} onClick={() => onToolChange("rotate")}><RotateCw size={15} /><span>旋转</span></button>
        </span>
      </div>
    </section>
  );
}
