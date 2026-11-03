import { VoiceInputButton } from "./VoiceInputButton";
import { Brush, Eraser, Sparkles, Trash2, Undo2, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  COLOR_META,
  COLOR_ORDER,
  type EmbroideryColor,
} from "../types/embroidery";
import { ARTWORK_PRESETS, resolvePromptPreset, type ArtworkPresetKey } from "../utils/artworkPresets";


import type { OrderedArtwork, OrderedStroke } from "../utils/orderedPointPaths";

type ArtworkCreatorProps = {
  onClose: () => void;
  onUseArtwork: (file: File, preserveSmallDetails?: boolean, orderedArtwork?: OrderedArtwork, preset?: ArtworkPresetKey, generated?: boolean) => void;
};

type ApiStatus = {
  checking: boolean;
  configured: boolean;
  model: string;
  error: string;
};

type Point = { x: number; y: number };

const CANVAS_SIZE = 640;
const MAX_UNDO_STEPS = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getServerError(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.error === "string" ? value.error : null;
}

function getCanvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法导出画布，请重试。"));
    }, "image/png");
  });
}

export function ArtworkCreator({ onClose, onUseArtwork }: ArtworkCreatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointCanvasRef = useRef<HTMLCanvasElement>(null);
  const [drawingMode, setDrawingMode] = useState<"points" | "brush">("points");
  const [pointStrokes, setPointStrokes] = useState<OrderedStroke[]>([]);
  const [closePoints, setClosePoints] = useState(true);
  const lastPointRef = useRef<Point | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const generationAbortRef = useRef<AbortController | null>(null);
  const generatedUrlRef = useRef("");
  const [activeTab, setActiveTab] = useState<"draw" | "doubao">("draw");
  const [provider, setProvider] = useState("wenxin");
  const modelChoices = [{id:"qwen",label:"通义千问"},{id:"wenxin",label:"文心一言"},{id:"deepseek",label:"DeepSeek"},{id:"zhipu",label:"智谱清言"},{id:"doubao",label:"豆包"}];
  const providerLabel = modelChoices.find(item => item.id === provider)!.label;
  const [selectedColor, setSelectedColor] = useState<EmbroideryColor>("red");
  const [customBrushColor,setCustomBrushColor]=useState<string|null>(null);
  const [brushSize, setBrushSize] = useState(18);
  const [isEraser, setIsEraser] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [drawError, setDrawError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const matchedPreset=resolvePromptPreset(prompt);
  const matchedArtwork=matchedPreset ? ARTWORK_PRESETS[matchedPreset] : null;
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [generatedFile, setGeneratedFile] = useState<File | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    checking: true,
    configured: false,
    model: "",
    error: "",
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setApiStatus({checking:true,configured:false,model:"",error:""});
    void fetch("/api/models/status", { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(getServerError(payload) ?? "读取模型配置失败。");
        }
        if (!isRecord(payload) || !Array.isArray(payload.providers)) throw new Error("模型服务返回了无效状态。");
        const status = payload.providers.find((item: unknown) => isRecord(item) && item.id === provider);
        if (!isRecord(status)) throw new Error("所选模型不可用。");
        setApiStatus({
          checking: false,
          configured: status.configured === true,
          model: typeof status.model === "string" ? status.model : "",
          error: "",
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setApiStatus({
          checking: false,
          configured: false,
          model: "",
          error: cause instanceof Error
            ? cause.message
            : "无法连接模型服务，请稍后重试。",
        });
      });

    return () => {
      controller.abort();
      generationAbortRef.current?.abort();
      if (generatedUrlRef.current) URL.revokeObjectURL(generatedUrlRef.current);
    };
  }, [provider]);

  const renderPoints = (context: CanvasRenderingContext2D, labels: boolean) => {
    context.fillStyle = "#ffffff"; context.fillRect(0,0,CANVAS_SIZE,CANVAS_SIZE);
    let number=0;
    for (const stroke of pointStrokes) {
      if (!stroke.vertices.length) continue;
      context.strokeStyle=COLOR_META[stroke.color].hex; context.fillStyle=COLOR_META[stroke.color].hex;
      context.lineWidth=3; context.lineCap="round"; context.lineJoin="round";
      context.beginPath(); context.moveTo(stroke.vertices[0].x,stroke.vertices[0].y);
      for(const v of stroke.vertices.slice(1)) context.lineTo(v.x,v.y);
      if(closePoints && stroke.vertices.length>2) context.closePath();
      context.stroke();
      for(const v of stroke.vertices) {
        number++; context.beginPath();context.arc(v.x,v.y,4,0,Math.PI*2);context.fill();
        if(labels){context.font="bold 16px sans-serif";context.fillText(String(number),v.x+8,v.y-8);}
      }
    }
  };
  useEffect(() => {
    const context=pointCanvasRef.current?.getContext("2d");
    if(context) renderPoints(context,true);
  }, [pointStrokes, closePoints]);

  const addVertex = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if(event.pointerType==="mouse" && event.button!==0) return;
    event.preventDefault();
    const point=canvasPoint(event);
    if(point.x<0||point.y<0||point.x>CANVAS_SIZE||point.y>CANVAS_SIZE)return;
    setPointStrokes(previous => {
      const last=previous[previous.length-1];
      if(last?.color===selectedColor) return [...previous.slice(0,-1),{...last,vertices:[...last.vertices,point]}];
      return [...previous,{color:selectedColor,vertices:[point],closed:closePoints}];
    });
    setDrawError("");
  };
  const undoVertex = () => setPointStrokes(previous => {
    const last=previous[previous.length-1]; if(!last)return previous;
    return last.vertices.length===1 ? previous.slice(0,-1) : [...previous.slice(0,-1),{...last,vertices:last.vertices.slice(0,-1)}];
  });

  const saveUndoState = (context: CanvasRenderingContext2D) => {
    undoStackRef.current.push(context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE));
    if (undoStackRef.current.length > MAX_UNDO_STEPS) undoStackRef.current.shift();
    setUndoCount(undoStackRef.current.length);
  };

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * CANVAS_SIZE,
      y: ((event.clientY - bounds.top) / bounds.height) * CANVAS_SIZE,
    };
  };

  const onDrawingPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) {
      setDrawError("浏览器无法创建画布绘图上下文。");
      return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    saveUndoState(context);
    const point = canvasPoint(event);
    context.fillStyle = isEraser ? "#ffffff" : customBrushColor ?? COLOR_META[selectedColor].hex;
    context.beginPath();
    context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
    context.fill();
    lastPointRef.current = point;
    setDrawError("");
  };

  const onDrawingPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const previous = lastPointRef.current;
    if (!previous) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;

    event.preventDefault();
    const point = canvasPoint(event);
    context.strokeStyle = isEraser ? "#ffffff" : customBrushColor ?? COLOR_META[selectedColor].hex;
    context.lineWidth = brushSize;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
  };

  const finishDrawing = () => {
    lastPointRef.current = null;
  };

  const undoDrawing = () => {
    const context = canvasRef.current?.getContext("2d");
    const previous = undoStackRef.current.pop();
    if (!context || !previous) return;
    context.putImageData(previous, 0, 0);
    setUndoCount(undoStackRef.current.length);
  };

  const clearDrawing = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      setDrawError("无法访问手绘画布。");
      return;
    }
    saveUndoState(context);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    setDrawError("");
  };

  const clearGeneratedArtwork = () => {
    if (generatedUrlRef.current) URL.revokeObjectURL(generatedUrlRef.current);
    generatedUrlRef.current = "";
    setGeneratedUrl("");
    setGeneratedFile(null);
  };

  const useDrawing = async () => {
    if(drawingMode === "points") {
      if(!pointStrokes.some(s=>s.vertices.length)) { setDrawError("请先按顺序点击顶点。"); return; }
      try {
        const canvas=document.createElement("canvas");canvas.width=CANVAS_SIZE;canvas.height=CANVAS_SIZE;
        const context=canvas.getContext("2d");if(!context)throw new Error("无法导出点选路径。");
        renderPoints(context,false);
        const artwork: OrderedArtwork={width:CANVAS_SIZE,height:CANVAS_SIZE,strokes:pointStrokes.map(s=>({...s,closed:closePoints}))};
        const blob=await getCanvasBlob(canvas);
        onUseArtwork(new File([blob],"按点连线图案.png",{type:"image/png"}),true,artwork);
      }catch(error){setDrawError(error instanceof Error ? error.message : "导出失败。");}
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      setDrawError("手绘画布尚未准备好。");
      return;
    }
    try {
      const blob = await getCanvasBlob(canvas);
      onUseArtwork(new File([blob], "手绘刺绣图案.png", { type: "image/png" }), true);
    } catch (cause) {
      setDrawError(cause instanceof Error ? cause.message : "导出手绘图案失败。");
    }
  };

  const generateFromPrompt = async () => {
    const cleanedPrompt = prompt.trim();
    if (!cleanedPrompt) {
      setAiError("请先描述想要刺绣的图案。");
      return;
    }
    if (!apiStatus.configured) {
      setAiError("所选模型暂未配置，请联系管理员。");
      return;
    }

    const controller = new AbortController();
    generationAbortRef.current = controller;
    setIsGenerating(true);
    setAiError("");
    clearGeneratedArtwork();
    try {
      const response = await fetch("/api/models/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cleanedPrompt, provider }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        throw new Error(
          getServerError(payload) ?? `模型生成失败（HTTP ${response.status}）。`,
        );
      }

      const source = await response.blob();
      if (!source.type.startsWith("image/")) {
        throw new Error("模型服务没有返回可用图片。");
      }
      const normalized = source;
      if (controller.signal.aborted) return;

      const file = new File([normalized], `模型生成刺绣图案.${source.type==="image/jpeg"?"jpg":"png"}`, {
        type: source.type,
      });
      const nextUrl = URL.createObjectURL(normalized);
      if (generatedUrlRef.current) URL.revokeObjectURL(generatedUrlRef.current);
      generatedUrlRef.current = nextUrl;
      setGeneratedUrl(nextUrl);
      setGeneratedFile(file);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setAiError(cause instanceof Error ? cause.message : "模型图片生成失败。");
      }
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
      }
      if (!controller.signal.aborted) setIsGenerating(false);
    }
  };

  const useGeneratedImage = async () => {
    if (isGenerating) return;
    if (!matchedPreset || !matchedArtwork) { if (generatedFile) onUseArtwork(generatedFile, false, undefined, undefined, true); return; }
    const controller=new AbortController();generationAbortRef.current=controller;
    setIsGenerating(true);setAiError("");
    try {
      const response=await fetch(matchedArtwork.imageUrl,{signal:controller.signal});
      if(!response.ok)throw new Error("图稿载入失败，请重试。");
      const blob=await response.blob();
      if(controller.signal.aborted)return;
      onUseArtwork(new File([blob],matchedArtwork.fileName,{type:matchedArtwork.mimeType}),true,undefined,matchedPreset);
    } catch(error) {if(!controller.signal.aborted)setAiError(error instanceof Error?error.message:"图稿载入失败。");}
    finally {if(generationAbortRef.current===controller)generationAbortRef.current=null;if(!controller.signal.aborted)setIsGenerating(false);}
  };

  return (
    <div
      className="artwork-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="artwork-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="artwork-modal-title"
      >
        <header className="artwork-modal-header">
          <div>
            <small>创建刺绣图案</small>
            <h2 id="artwork-modal-title">手绘图案，或用模型生成</h2>
          </div>
          <button
            className="artwork-close-button"
            type="button"
            aria-label="关闭创作窗口"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="artwork-tabs" role="tablist" aria-label="图案创作方式">
          <button
            className={activeTab === "draw" ? "selected" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === "draw"}
            onClick={() => setActiveTab("draw")}
          >
            <Brush size={15} /> 自己画
          </button>
          <button
            className={activeTab === "doubao" ? "selected" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === "doubao"}
            onClick={() => setActiveTab("doubao")}
          >
            <Sparkles size={15} /> 模型文生图
          </button>
        </div>

        <div className="artwork-modal-content">
          <section
            className={`artwork-draw-pane ${activeTab === "draw" ? "" : "artwork-hidden"}`}
            aria-hidden={activeTab !== "draw"}
          >
            <div className="ordered-path-tools">
              <button type="button" aria-pressed={drawingMode==="points"} onClick={()=>{setDrawingMode("points");setIsEraser(false);}}>点选路径</button>
              <button type="button" aria-pressed={drawingMode==="brush"} onClick={()=>setDrawingMode("brush")}>画笔填色</button>
              {drawingMode==="points" && <label><input type="checkbox" checked={closePoints} onChange={e=>setClosePoints(e.target.checked)} />闭合路径（至少3点，回到首点）</label>}
            </div>
            {drawingMode==="brush"&&<label className="custom-thread-picker">自选画笔颜色 <input type="color" aria-label="自选画笔颜色" value={customBrushColor??COLOR_META[selectedColor].hex} onChange={e=>{setCustomBrushColor(e.target.value);setIsEraser(false);}}/><small>手绘导入后按近似色合并</small></label>}
            <div className="artwork-draw-toolbar">
              <div className="artwork-palette" aria-label="刺绣线色">
                {COLOR_ORDER.map((color) => (
                  <button
                    key={color}
                    className={`artwork-palette-color ${!isEraser && selectedColor === color ? "selected" : ""}`}
                    type="button"
                    title={`${COLOR_META[color].label}画笔`}
                    aria-label={`${COLOR_META[color].label}画笔`}
                    aria-pressed={!isEraser && selectedColor === color}
                    onClick={() => {
                      setSelectedColor(color);
                      setCustomBrushColor(null);
                      setIsEraser(false);
                    }}
                  >
                    <i style={{ backgroundColor: COLOR_META[color].hex }} />
                    {COLOR_META[color].label}
                  </button>
                ))}
                <button
                  className={`artwork-palette-color ${isEraser ? "selected" : ""}`}
                  type="button"
                  hidden={drawingMode==="points"}
                  aria-label="白色橡皮擦"
                  aria-pressed={isEraser}
                  onClick={() => setIsEraser(true)}
                >
                  <Eraser size={14} /> 橡皮擦
                </button>
              </div>
              <label className="artwork-brush-size" style={{display:drawingMode==="brush" ? undefined : "none"}}>
                <span>笔刷</span>
                <input
                  type="range"
                  min="4"
                  max="52"
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                />
                <b>{brushSize}px</b>
              </label>
              <div className="artwork-draw-actions">
                <button type="button" disabled={drawingMode==="points" ? pointStrokes.length===0 : undoCount===0} onClick={drawingMode==="points" ? undoVertex : undoDrawing}>
                  <Undo2 size={14} /> 撤销
                </button>
                <button type="button" onClick={drawingMode==="points" ? ()=>setPointStrokes([]) : clearDrawing}>
                  <Trash2 size={14} /> 清空
                </button>
              </div>
            </div>
            <div className="artwork-canvas-wrap">
              <canvas ref={pointCanvasRef} className="artwork-drawing-canvas"
                width={CANVAS_SIZE} height={CANVAS_SIZE} aria-label="按顺序点选顶点画布"
                style={{display:drawingMode==="points" ? undefined : "none"}} onPointerDown={addVertex} />
              <canvas
                style={{display:drawingMode==="brush" ? undefined : "none"}}
                ref={canvasRef}
                className="artwork-drawing-canvas"
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                aria-label="黑红黄蓝四色手绘画布"
                onPointerDown={onDrawingPointerDown}
                onPointerMove={onDrawingPointerMove}
                onPointerUp={finishDrawing}
                onPointerCancel={finishDrawing}
                onLostPointerCapture={finishDrawing}
              />
            </div>
            <p className="artwork-help">
              {drawingMode==="points"
                ? "按轮廓顺序点击顶点（例如左上→右上→右下→左下），数字表示顺序。默认闭合回首点；首点下针，边上按主界面的“针迹简化”设置分针。切换颜色会开始另一条路径。"
                : "画笔模式按颜色区域生成填充路径，不保留点击顺序。完成后先检查路径预览，再发送给FPGA。"}
            </p>
            {drawError && <p className="artwork-error" role="alert">{drawError}</p>}
          </section>

          <section
            className={`artwork-ai-pane ${activeTab === "doubao" ? "" : "artwork-hidden"}`}
            aria-hidden={activeTab !== "doubao"}
          >
            <div className="artwork-prompt-column">
              <label className="artwork-prompt-label" htmlFor="image-model">选择创作模型</label>
              <select id="image-model" className="model-select" value={provider} disabled={isGenerating || voiceListening} onChange={e => { setProvider(e.target.value); clearGeneratedArtwork(); setAiError(""); }}>
                {modelChoices.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
              </select>
              <div className="model-description">{provider === "deepseek" ? "优化图案描述后，交由图像模型生成。" : provider === "wenxin" && apiStatus.model === "musesteamer-air-image" ? "百度千帆 · 蒸汽机 Air-Image" : `${providerLabel} · 文生图`}</div>
              <label className="artwork-prompt-label" htmlFor="doubao-prompt">
                描述你想绣的图案
              </label>
              <textarea
                id="doubao-prompt"
                value={prompt}
                maxLength={1000}
                placeholder=""
                onChange={(event) => {
                  setPrompt(event.target.value);
                  clearGeneratedArtwork();
                  setAiError("");
                }}
                disabled={isGenerating || voiceListening}
              />
              <VoiceInputButton value={prompt} disabled={isGenerating || activeTab !== "doubao"}
                onListeningChange={setVoiceListening}
                onChange={value => { setPrompt(value); clearGeneratedArtwork(); setAiError(""); }} />
              <div className="artwork-prompt-meta">
                <span>适合描述主体、姿态和构图</span>
                <span>{prompt.length}/1000</span>
              </div>
              <div className="artwork-prompt-examples">
                <span>试试：</span>
                {[
                  "黑红黄蓝四色的简笔蝴蝶，白底，翅膀对称",
                  "由黑红黄蓝色块组成的小帆船，白色背景",
                ].map((example) => (
                  <button
                    key={example}
                    type="button"
                    disabled={isGenerating || voiceListening}
                    onClick={() => {
                      setPrompt(example);
                      clearGeneratedArtwork();
                      setAiError("");
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
              {(matchedArtwork || apiStatus.configured) && <div className={`artwork-api-status ${apiStatus.configured ? "configured" : ""}`} role="status">
                {matchedArtwork ? `已识别「${matchedArtwork.label}」 · ${matchedArtwork.needleCount}针，可使用图案生成刺绣路径。` : `${providerLabel}服务已配置 · ${apiStatus.model}`}
              </div>}
              {!matchedArtwork && <p className="model-status" role="status">{apiStatus.checking ? "正在读取模型状态…" : apiStatus.error || (!apiStatus.configured ? "当前模型暂未配置服务" : "")}</p>}
              {!matchedArtwork && <button
                className="artwork-generate-button"
                type="button"
                disabled={!apiStatus.configured || apiStatus.checking || isGenerating || voiceListening || !prompt.trim()}
                onClick={() => void generateFromPrompt()}
              >
                {isGenerating
                  ? <span className="loading-spinner" />
                  : <Sparkles size={15} />}
                {isGenerating ? "模型正在生成…" : "生成彩色刺绣图案"}
              </button>}
              {aiError && <p className="artwork-error" role="alert">{aiError}</p>}
            </div>

            <div className="artwork-ai-preview">
              <div className="artwork-ai-preview-title">生成结果预览</div>
              {matchedArtwork || generatedUrl
                ? <img src={matchedArtwork?.imageUrl ?? generatedUrl} alt={matchedArtwork ? `${matchedArtwork.label}图稿预览` : "模型生成的彩色刺绣图案"} />
                : <div className="artwork-ai-empty"><Sparkles size={24} /><span>生成结果将在这里显示</span></div>}
              <small>{matchedArtwork ? "使用图案后可查看、修改针点并上传。" : "保留彩色；导入后自动合并近似色，可逐色检查并发送路径。"}</small>
            </div>
          </section>
        </div>

        <footer className="artwork-modal-footer">
          <span>图案会载入现有流程，不会直接发送原始图片到 FPGA。</span>
          <div>
            <button className="artwork-secondary-button" type="button" onClick={onClose}>
              取消
            </button>
            {activeTab === "draw" ? (
              <button className="artwork-primary-button" type="button" onClick={() => void useDrawing()}>
                {drawingMode==="points" ? "使用点选路径" : "使用这张手绘图"}
              </button>
            ) : (
              <button
                className="artwork-primary-button"
                type="button"
                disabled={isGenerating || voiceListening || (!matchedArtwork && !generatedFile)}
                onClick={useGeneratedImage}
              >
                使用生成图
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

