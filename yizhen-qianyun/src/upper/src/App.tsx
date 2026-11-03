import "./color-runtime.css";
import { ThreadLayersPanel } from "./components/ThreadLayersPanel";
import { StabilityPanel } from "./components/StabilityPanel";
import { mergeThreadColors } from "./utils/adaptiveColors";
import { rasterizeImage } from "./utils/imageProcessing";
import { AuthGate } from "./components/AuthGate";
import { DataTransferPage } from "./components/DataTransferPage";
import { SerialCapturePanel } from "./components/SerialCapturePanel";
import {
  AlertTriangle,
  Crosshair,
  Grid2X2,
  Minus,
  Play,
  Plus,
  Settings,
  Sparkles,
  LogOut,
  UserRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { generateBirdPreset } from "./utils/birdPreset";
import { ARTWORK_PRESETS, type ArtworkPresetKey } from "./utils/artworkPresets";
import { NeedleEditPanel } from "./components/NeedleEditPanel";
import { editNeedle, keepNeedlesInsideFrame, type NeedleEdit, type NeedleEditMode, type NeedleSelection } from "./utils/needleEditing";
import { CanvasEditor } from "./components/CanvasEditor";
import { ArtworkCreator } from "./components/ArtworkCreator";
import { CameraCapturePanel } from "./components/CameraCapturePanel";
import { ColorPanel } from "./components/ColorPanel";
import { DevicePanel } from "./components/DevicePanel";
import { ExportPanel } from "./components/ExportPanel";
import { FrameSettings } from "./components/FrameSettings";
import { formatFileSize, ImageUploader } from "./components/ImageUploader";
import { PathPreview } from "./components/PathPreview";
import { StatisticsPanel } from "./components/StatisticsPanel";
import {
  COLOR_META,
  COLOR_ORDER,
  type CanvasTool,
  type ColorAnalysis,
  type EmbroideryColor,
  type FrameSize,
  type PositionMm,
  type PathSet,
  type PreviewMode,
} from "./types/embroidery";
import { detectColorRegions } from "./utils/colorDetection";
import { getImageSizeMm, isImageOutsideFrame } from "./utils/coordinateTransform";
import { arePathsOutsideFrame, generateEmbroideryPaths, STITCH_DENSITIES } from "./utils/pathGenerator";
import { generateOrderedPaths, type OrderedArtwork } from "./utils/orderedPointPaths";
import { generateGraphStrokePaths } from "./utils/graphStrokePaths";
import { generateOneStrokePaths } from "./utils/oneStrokePaths";
import { generateContourPaths } from "./utils/contourPaths";
import { standardizePaths } from "./utils/pathExport";

const DEFAULT_FRAME: FrameSize = { width: 100, height: 100 };
const DEFAULT_POSITION: PositionMm = { x: 0, y: 0 };
const MAX_IMAGE_PIXELS = 40_000_000;
const DEFAULT_COLORS: Record<EmbroideryColor, boolean> = {
  black: true,
  red: true,
  yellow: true,
  blue: true,
};



function App() {
  return <AuthGate>{(user, logout) => <Workspace user={user} onLogout={logout}/>}</AuthGate>;
}

function Workspace({ user, onLogout }: { user: string; onLogout: () => Promise<void> }) {
  const [page, setPage] = useState<"studio" | "serial" | "data">(new URLSearchParams(location.search).get("capture") === "1" ? "serial" : "studio");
  const [stepsPerMm, setStepsPerMm] = useState(1600);
  const [colorMode,setColorMode]=useState(true);
  const [mergeDistance,setMergeDistance]=useState(22);
  const [maxColors,setMaxColors]=useState(16);
  const [threadIndex,setThreadIndex]=useState(0);
  const [taskLocked,setTaskLocked]=useState(false);
  const [completedThreads,setCompletedThreads]=useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageUrlRef = useRef<string | null>(null);
  const loadRequestRef = useRef(0);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageBytes, setImageBytes] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [notice, setNotice] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showArtworkCreator, setShowArtworkCreator] = useState(false);
  const [frame, setFrame] = useState<FrameSize>(DEFAULT_FRAME);
  const [position, setPosition] = useState<PositionMm>(DEFAULT_POSITION);
  const [scale, setScale] = useState(0.8);
  const [rotation, setRotation] = useState(0);
  const [tolerance, setTolerance] = useState(20);
  const [routeStyle, setRouteStyle] = useState<"graph" | "one-stroke" | "contour" | "fill">("graph");
  const [stitchDensity, setStitchDensity] = useState<keyof typeof STITCH_DENSITIES>("simple");
  const density = STITCH_DENSITIES[stitchDensity];
  const [preserveSmallDetails, setPreserveSmallDetails] = useState(false);
  const [orderedArtwork, setOrderedArtwork] = useState<OrderedArtwork | null>(null);
  const [birdPreset,setBirdPreset] = useState<false|ArtworkPresetKey>(false);
  const [legacyAnalysis, setAnalysis] = useState<ColorAnalysis | null>(null);
  const [visibleColors, setVisibleColors] = useState(DEFAULT_COLORS);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("original");
  const [tool, setTool] = useState<CanvasTool>("move");
  const [showGrid, setShowGrid] = useState(true);
  const [viewZoom, setViewZoom] = useState(1);
  const [needleMode,setNeedleMode]=useState<NeedleEditMode>("off");
  const [needleColor,setNeedleColor]=useState<EmbroideryColor>("black");
  const [needleSelection,setNeedleSelection]=useState<NeedleSelection|null>(null);
  const [needleHistory,setNeedleHistory]=useState<{base:PathSet;current:PathSet;undo:PathSet[];redo:PathSet[]}|null>(null);
  const colorOrder = COLOR_ORDER;

  const colorLayers=useMemo(()=>{
    if(!colorMode||!image)return {layers:[],error:""};
    try{const raster=rasterizeImage(image,360);return {layers:mergeThreadColors(raster.pixels.data,raster.width,raster.height,mergeDistance,maxColors,image.naturalWidth,image.naturalHeight,preserveSmallDetails),error:""};}
    catch(cause){return {layers:[],error:cause instanceof Error?cause.message:"彩色分层失败"};}
  },[image,colorMode,mergeDistance,maxColors,preserveSmallDetails]);
  const activeThread=colorLayers.layers[Math.min(threadIndex,Math.max(0,colorLayers.layers.length-1))];
  const analysis=colorMode ? activeThread?.analysis??null : legacyAnalysis;
  useEffect(()=>{setThreadIndex(0);setCompletedThreads([]);},[image,mergeDistance,maxColors]);
  // Reviewed artwork is saved in src/data/*-route.json. Reuse its exact order;
  // style/density/analysis changes must never invoke a planner for these presets.
  const savedPresetResult=useMemo(()=>{
    if(!birdPreset)return null;
    try{return {paths:generateBirdPreset(frame,position,scale,rotation,birdPreset),error:""};}
    catch(error){return {paths:null,error:error instanceof Error?error.message:"路径载入失败。"};}
  },[birdPreset,frame,position,scale,rotation]);
  const pathResult = useMemo(() => {
    if(savedPresetResult)return savedPresetResult;
    if (!analysis) return {paths:null,error:""};
    try {
      return {paths: orderedArtwork && !colorMode
        ? generateOrderedPaths(orderedArtwork, frame, position, scale, rotation, density.stitchSpacingMm)
        : routeStyle === "graph"
          ? generateGraphStrokePaths(analysis, frame, position, scale, rotation, density.stitchSpacingMm)
          : routeStyle === "one-stroke"
          ? generateOneStrokePaths(analysis, frame, position, scale, rotation, density)
          : routeStyle === "contour"
          ? generateContourPaths(analysis, frame, position, scale, rotation, density.stitchSpacingMm)
          : generateEmbroideryPaths(analysis, frame, position, scale, rotation, density), error:""};
    } catch (error) { return {paths:null,error:error instanceof Error ? error.message : "路径生成失败。"}; }
  }, [analysis, frame, position, rotation, scale, orderedArtwork, density, routeStyle, savedPresetResult,colorMode]);
  const history=needleHistory?.base===pathResult.paths?needleHistory:null;
  const cropped=useMemo(()=>{
    const source=history?.current??pathResult.paths;
    return source?keepNeedlesInsideFrame(source,frame):{paths:null,removed:0};
  },[history?.current,pathResult.paths,frame]);
  const paths=cropped.paths;
  useEffect(()=>{setNeedleSelection(null);setNeedleHistory(null);},[pathResult.paths]);
  useEffect(()=>{if(colorMode)setNeedleColor("black");},[colorMode]);
  const commitNeedleEdit=(edit:NeedleEdit)=>{
    if(!paths||!pathResult.paths||taskLocked)return;
    try {
      const next=editNeedle(paths,edit);
      setNeedleHistory({base:pathResult.paths,current:next,undo:[...(history?.undo??[]),paths].slice(-50),redo:[]});
      const point=edit.kind==="delete"?null:edit.point;
      setNeedleSelection(point&&point.x>=0&&point.y>=0&&point.x<=frame.width&&point.y<=frame.height
        ?edit.kind==="add"?{color:edit.color,index:edit.after+1}:edit.kind==="move"?edit.selection:null:null);
      setNotice("落针点已修改，预览与待上传数据已更新；请重新上传路径。");
    } catch(error){setNotice(error instanceof Error?error.message:"修改落针点失败。");}
  };
  const undoNeedleEdit=()=>{
    if(taskLocked||!history?.undo.length)return;
    setNeedleHistory({...history,current:history.undo.at(-1)!,undo:history.undo.slice(0,-1),redo:[history.current,...history.redo]});setNeedleSelection(null);
  };
  const redoNeedleEdit=()=>{
    if(taskLocked||!history?.redo.length)return;
    setNeedleHistory({...history,current:history.redo[0],undo:[...history.undo,history.current],redo:history.redo.slice(1)});setNeedleSelection(null);
  };

  const imageSize = image
    ? getImageSizeMm(image.naturalWidth, image.naturalHeight, frame, scale)
    : { width: 0, height: 0 };
  const imageOutOfBounds = !!image &&
    isImageOutsideFrame(imageSize, frame, position, rotation);
  const pathsOutOfBounds = !!paths && arePathsOutsideFrame(paths, frame);
  const exportCandidate = useMemo(() => {
    if (!paths || !analysis || !image) {
      return { data: null, error: pathResult.error || "先上传图片并成功生成刺绣路径。" };
    }
    try {
      return {
        data: standardizePaths(paths, frame, colorOrder, {
          thread:colorMode&&activeThread?{id:activeThread.id,label:activeThread.label,hex:activeThread.hex,index:threadIndex,total:colorLayers.layers.length,mergeDistance}:undefined,
          image: {
            name: imageName,
            width: image.naturalWidth,
            height: image.naturalHeight,
          },
          generation: {
            tolerance,
            scale,
            rotationDegrees: rotation,
            positionXmm: position.x,
            positionYmm: position.y,
          },
        }),
        error: "",
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "路径校验失败。",
      };
    }
  }, [analysis, colorOrder, frame, image, imageName, paths, pathResult.error, position.x, position.y, rotation, scale, tolerance,colorMode,activeThread,threadIndex,colorLayers.layers.length,mergeDistance]);
  const regionCounts = useMemo(
    () => ({
      black: analysis?.masks.black.regions.length ?? 0,
      red: analysis?.masks.red.regions.length ?? 0,
      yellow: analysis?.masks.yellow.regions.length ?? 0,
      blue: analysis?.masks.blue.regions.length ?? 0,
    }),
    [analysis],
  );

  useEffect(
    () => () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    },
    [],
  );

  const loadFile = useCallback((file?: File, keepSmallDetails = false, ordered?: OrderedArtwork, useBirdPreset: false|ArtworkPresetKey = false, _generated = false) => {
    if (!file) return;
    if(taskLocked){setNotice("当前路径尚未完成，请完成或任务复位后再载入新图片。");return;}
    // Ordinary uploads use their actual pixels and selected planning mode.
    // Only explicit keyword artwork selections use a saved sequence.
    const routePreset = useBirdPreset;
    const supportedType = ["image/png", "image/jpeg", "image/bmp", "image/x-ms-bmp"].includes(file.type)
      || (routePreset === "taiji" && file.type === "image/svg+xml");
    const supportedExtension = /\.(png|jpe?g|bmp)$/i.test(file.name);
    if (!supportedType && !supportedExtension) {
      setUploadError("文件格式不支持，请选择 PNG、JPG、JPEG 或 BMP 图片。");
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setUploadError("图片文件超过 40 MB，请选择较小的图片。");
      return;
    }

    const requestId = ++loadRequestRef.current;
    const nextUrl = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.onload = () => {
      if (requestId !== loadRequestRef.current) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      if (nextImage.naturalWidth * nextImage.naturalHeight > MAX_IMAGE_PIXELS) {
        URL.revokeObjectURL(nextUrl);
        setUploadError("图片像素总数超过 4000 万，请缩小图片后重试。");
        return;
      }
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = nextUrl;
      setImage(nextImage);
      setImageUrl(nextUrl);
      setImageName(file.name);
      setPreserveSmallDetails(keepSmallDetails);
      setOrderedArtwork(ordered ?? null);
      setImageBytes(file.size);
      setPosition(routePreset === "butterfly" ? ARTWORK_PRESETS.butterfly.position : DEFAULT_POSITION);
      setScale(routePreset ? ARTWORK_PRESETS[routePreset].scale : .8);
      setColorMode(!routePreset && !ordered);
      setBirdPreset(routePreset);
      if(routePreset)setFrame(DEFAULT_FRAME);
      setRotation(0);
      setAnalysis(routePreset ? detectColorRegions(nextImage,20,{lineArt:true,preserveSmallDetails:true}) : null);
      setPreviewMode(routePreset ? "path" : "original");
      setUploadError("");
      setIsGenerating(false);
      setNotice(routePreset === "taiji" ? "太极路径已生成，默认直径60mm（6cm），可检查后发送。" : routePreset ? "图案处理完成，针迹已生成，可编辑或上传。" : "");

    };
    nextImage.onerror = () => {
      URL.revokeObjectURL(nextUrl);
      if (requestId !== loadRequestRef.current) return;
      setUploadError("图片无法读取，请另存为 PNG、JPG、JPEG 或 BMP 后重试。");
    };
    nextImage.src = nextUrl;
  }, [taskLocked]);

  const generatePaths = async () => {
    if (!image || isGenerating) return;
    if(colorMode){setNeedleHistory(null);setNeedleSelection(null);setPreviewMode("path");setNotice(colorLayers.error||pathResult.error||(colorLayers.layers.length?`近似色已合并为${colorLayers.layers.length}层，已按所选走线方式生成，当前显示${activeThread?.label??"空色层"}。`:"未识别到可绣色层，白色和近白背景已忽略。"));return;}
    if(birdPreset){setNeedleHistory(null);setNeedleSelection(null);setPreviewMode("path");setNotice("针迹已重新生成，请检查后上传路径。");return;}
    setIsGenerating(true);
    setNotice("");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const detected = detectColorRegions(image, tolerance, { preserveSmallDetails, lineArt: routeStyle === "graph" && !orderedArtwork });
      setAnalysis(detected);
      setPreviewMode("path");
      const recognized = COLOR_ORDER.reduce(
        (total, color) => total + detected.masks[color].regions.length,
        0,
      );
      if (orderedArtwork) {
        const vertices = orderedArtwork.strokes.reduce((n,s)=>n+s.vertices.length,0);
        setNotice(`按点击顺序生成${vertices}个顶点；首点下针，边上针距不超过${density.stitchSpacingMm}mm${orderedArtwork.strokes.some(s=>s.closed && s.vertices.length>2) ? "，已闭合回首点" : ""}。`);
      } else if (!recognized) {
        setNotice("未识别到明显的黑、红、黄、蓝色区域。可提高颜色容差后重新生成。");
      } else {
        setNotice(`识别完成：${recognized} 个独立颜色区域，路径已转换为毫米坐标。`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片处理失败，请重新上传图片后重试。");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleColor = (color: EmbroideryColor, enabled: boolean) => {
    setVisibleColors((current) => ({ ...current, [color]: enabled }));
  };

  const toggleAllColors = (enabled: boolean) => {
    setVisibleColors({ black: enabled, red: enabled, yellow: enabled, blue: enabled });
  };

  return (
    <main className={`app-shell app-page-${page} ${colorMode?"adaptive-mode":""}`}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="一针千韵湘绣工作台首页">
          <span className="brand-mark" aria-hidden="true">湘绣</span>
          <span className="brand-copy"><strong>一针千韵</strong><small>湘绣 · 非遗智能刺绣工作台</small></span>
        </a>
        <nav className="page-nav" aria-label="主导航">
          {([["studio","刺绣工作台"],["serial","串口传输"],["data","数据传输"]] as const).map(([id,label]) => <button key={id} type="button" aria-current={page === id ? "page" : undefined} onClick={() => setPage(id)}>{label}</button>)}
        </nav>
        <div className="account-menu"><span><UserRound size={14}/>{user}</span><button type="button" onClick={() => { if (window.confirm("退出登录将断开本页串口连接，板卡已启动的任务不会因此停止。确认退出？")) void onLogout().catch(cause => setNotice(cause instanceof Error ? cause.message : "退出失败")); }}><LogOut size={14}/>退出</button></div>
        <span className="heritage-motto" aria-hidden="true">以针为笔 · 以线传情</span><button className="topbar-settings" type="button" aria-label="摄像头外设配置" title="摄像头外设配置" onClick={() => { setPage("studio"); window.location.hash="camera"; requestAnimationFrame(() => document.getElementById("camera")?.scrollIntoView({behavior:"smooth",block:"start"})); }}>
          <Settings size={17} />
        </button>
      </header>

      <section className="workspace-grid">
        <aside className="left-sidebar">
          <ImageUploader
            fileInputRef={fileInputRef}
            imageName={imageName}
            imageUrl={imageUrl}
            imageWidth={image?.naturalWidth ?? 0}
            imageHeight={image?.naturalHeight ?? 0}
            fileSize={formatFileSize(imageBytes)}
            error={uploadError}
            onSelect={loadFile}
          />
          <CameraCapturePanel onUsePhoto={loadFile} />
          <button
            className="artwork-create-button"
            type="button"
            onClick={() => setShowArtworkCreator(true)}
          >
            <Sparkles size={15} />
            手绘 / 模型文生图
          </button>
          <ThreadLayersPanel enabled={colorMode} onEnabled={setColorMode} layers={colorLayers.layers} index={threadIndex} onIndex={setThreadIndex} tolerance={mergeDistance} onTolerance={setMergeDistance} maxColors={maxColors} onMaxColors={setMaxColors} locked={taskLocked||!!birdPreset} completed={completedThreads}/>
          {colorLayers.error&&<p role="alert" className="panel-error">{colorLayers.error}</p>}
          <FrameSettings
            frame={frame}
            position={position}
            scale={scale}
            rotation={rotation}
            tolerance={tolerance}
            tool={tool}
            disabled={!image||taskLocked}
            onFrameChange={setFrame}
            onPositionChange={value=>{if(!taskLocked)setPosition(value)}}
            onScaleChange={value=>{if(!taskLocked)setScale(value)}}
            onRotationChange={value=>{if(!taskLocked)setRotation(value)}}
            onToleranceChange={setTolerance}
            onToolChange={setTool}
          />
          <div className="transform-summary">
            <span>X: <b>{position.x.toFixed(1)} mm</b></span>
            <span>Y: <b>{position.y.toFixed(1)} mm</b></span>
            <span>Scale: <b>{Number((scale * 100).toFixed(1))}%</b></span>
            <span>Rotation: <b>{rotation.toFixed(0)}°</b></span>
          </div>
          {!orderedArtwork && !birdPreset && <div className="stitch-density-setting">
            <label htmlFor="route-style">走线方式</label>
            <select id="route-style" value={routeStyle} disabled={isGenerating||taskLocked} onChange={event=>{
              setRouteStyle(event.target.value as "graph" | "one-stroke" | "contour" | "fill");
              if((event.target.value==="graph") !== (routeStyle==="graph")){setAnalysis(null);setPreviewMode("original");}
              setNotice("走线方式已更新，请重新生成并上传路径。");
            }}>
              <option value="graph">线稿一笔画 · 花蕊接花心（默认）</option>
              <option value="one-stroke">一笔走线＋疏填充</option>
              <option value="contour">仅轮廓</option>
              <option value="fill">横向填充</option>
            </select>
            <small>{routeStyle==="graph" ? "适合花朵等线稿：花蕊短线补接到中央轮廓，允许沿原线回走，整条路线闭合不断线；补接线也会实际走针。没有中央轮廓时自动使用短连接线。" : "细线合成中心线，宽区域疏填充；必要时沿已有线回走，再去下一独立图案。"}</small>
          </div>}
          {!birdPreset && <div className="stitch-density-setting">
            <label htmlFor="stitch-density">针迹简化</label>
            <select id="stitch-density" value={stitchDensity} disabled={isGenerating||taskLocked}
              onChange={event => {
                setStitchDensity(event.target.value as keyof typeof STITCH_DENSITIES);
                setNotice("针迹密度已更新，请查看落针数并重新上传路径；板卡原有缓存不会自动改变。");
              }}>
              <option value="simple">精简（默认）</option>
              <option value="sparse">更少针</option>
              <option value="detailed">细致</option>
            </select>
            <small>针距 ≤{density.stitchSpacingMm}mm{!orderedArtwork && routeStyle !== "contour" && routeStyle !== "graph" && ` · 填充行距 ${density.rowSpacingMm}mm`}。{routeStyle==="graph" ? "曲线转弯处保留必要针点；允许回走。" : "间隔越大，针数越少、填充越疏；保留手绘顶点。"}</small>
          </div>}
          <label className="small-detail-option">
            <input type="checkbox" checked={preserveSmallDetails} disabled={!image || isGenerating || !!birdPreset}
              onChange={event => {
                setPreserveSmallDetails(event.target.checked);
                setAnalysis(null);
                setPreviewMode("original");
                setNotice("识别设置已改变，请重新生成路径。");
              }} />
            保留小点（手绘自动开启）
          </label>
          <button
            className="generate-button"
            type="button"
            disabled={!image || isGenerating}
            onClick={generatePaths}
          >
            {isGenerating ? <span className="loading-spinner" /> : <Play size={16} fill="currentColor" />}
            {isGenerating ? "正在识别并生成…" : "生成刺绣路径"}
          </button>
            <NeedleEditPanel paths={paths} mode={needleMode} onModeChange={setNeedleMode}
              color={needleColor} onColorChange={color=>{setNeedleColor(color);setNeedleSelection(null);}} selection={needleSelection} removed={cropped.removed}
              canUndo={!!history?.undo.length} canRedo={!!history?.redo.length} hasEdits={!!history}
              onUndo={undoNeedleEdit} onRedo={redoNeedleEdit}
              onReset={()=>{setNeedleHistory(null);setNeedleSelection(null);}}
              onDelete={()=>{if(needleSelection)commitNeedleEdit({kind:"delete",selection:needleSelection});}} />
          {pathResult.error && <p className="notice-message notice-warning" role="alert">{pathResult.error}</p>}
          {notice && <p className={`notice-message ${notice.startsWith("未识别") || notice.includes("失败") ? "notice-warning" : ""}`} role="status">{notice}</p>}
        </aside>

        <section className="center-workspace">
          <section className="panel canvas-panel">
            <div className="canvas-toolbar">
              <strong>画布预览</strong>
              <div className="canvas-toolbar-actions">
                <div className="segmented-control">
                  <button type="button" className={previewMode === "original" ? "selected" : ""} onClick={() => setPreviewMode("original")}>原图视图</button>
                  <button type="button" className={previewMode === "path" ? "selected" : ""} onClick={() => setPreviewMode("path")} disabled={!analysis}>路径视图</button>
                </div>
                <button type="button" className={`toolbar-icon ${needleMode!=="off"?"toolbar-active":""}`} disabled={!paths}
                  onClick={()=>setNeedleMode(needleMode==="off"?"move":"off")}>编辑针点</button>
                <button
                  className={`toolbar-icon ${showGrid ? "toolbar-active" : ""}`}
                  type="button"
                  aria-pressed={showGrid}
                  onClick={() => setShowGrid((current) => !current)}
                >
                  <Grid2X2 size={14} /> 网格
                </button>
                <div className="zoom-control" aria-label="画布显示缩放">
                  <button type="button" aria-label="缩小画布" onClick={() => setViewZoom((current) => Math.max(0.55, Number((current - 0.1).toFixed(2))))}><Minus size={14} /></button>
                  <span>{Math.round(viewZoom * 100)}%</span>
                  <button type="button" aria-label="放大画布" onClick={() => setViewZoom((current) => Math.min(1.8, Number((current + 0.1).toFixed(2))))}><Plus size={14} /></button>
                </div>
              </div>
            </div>
            <div className="canvas-measure-x">{frame.width} mm</div>
            <div className="canvas-measure-y">{frame.height} mm</div>
            <CanvasEditor showJumpMoves={birdPreset==="rabbit"||birdPreset==="butterfly"}
              image={image}
            threadHex={colorMode?activeThread?.hex:undefined}
            threadLabel={colorMode?activeThread?.label:undefined}
              frame={frame}
              position={position}
              scale={scale}
              rotation={rotation}
              paths={paths}
              analysis={analysis}
              visibleColors={visibleColors}
              colorOrder={colorOrder}
              mode={previewMode}
              tool={tool}
              showGrid={showGrid}
              viewZoom={viewZoom}
              imageOutOfBounds={!birdPreset && imageOutOfBounds}
              pathsOutOfBounds={pathsOutOfBounds}
              onPositionChange={value=>{if(!taskLocked)setPosition(value)}}
              onScaleChange={value=>{if(!taskLocked)setScale(value)}}
              onRotationChange={value=>{if(!taskLocked)setRotation(value)}}
              needleMode={needleMode} needleColor={needleColor} needleSelection={needleSelection}
              onNeedleSelect={setNeedleSelection} onNeedleEdit={commitNeedleEdit}
              onDropFile={loadFile}
            />
            <div className="canvas-status">
              <span><Crosshair size={12} /> 手动相对原点 <b>{(frame.width / 2).toFixed(1)}, {(frame.height / 2).toFixed(1)} mm</b></span>
              <span>{frame.width} × {frame.height} mm <i /> 网格 10 mm</span>
            </div>
          </section>
          <PathPreview showJumpMoves={birdPreset==="rabbit"||birdPreset==="butterfly"}
            threadHex={colorMode?activeThread?.hex:undefined}
            threadLabel={colorMode?activeThread?.label:undefined}
            paths={paths}
            frameWidth={frame.width}
            frameHeight={frame.height}
            visibleColors={visibleColors}
            colorOrder={colorOrder}
            mode={previewMode}
            onModeChange={setPreviewMode}
          />
        </section>

        <aside className="right-sidebar">
          {!colorMode && <ColorPanel
            activeColors={visibleColors}
            regions={regionCounts}
            hasAnalysis={!!analysis}
            imageUrl={imageUrl}
            onToggleColor={toggleColor}
            onToggleAll={toggleAllColors}
          />}
          <StatisticsPanel threadHex={colorMode?activeThread?.hex:undefined} threadLabel={colorMode?activeThread?.label:undefined} paths={paths} regions={regionCounts} colorOrder={colorOrder} />
          <div className="persistent-device"><DevicePanel
            data={exportCandidate.data}
            stepsPerMm={stepsPerMm}
            onStepsPerMmChange={setStepsPerMm}
            onTaskLockChange={setTaskLocked}
            onThreadDone={id=>setCompletedThreads(current=>current.includes(id)?current:[...current,id])}
            disabledReason={pathsOutOfBounds ? "路径超出画框范围，修正图片位置后再发送。" : exportCandidate.error}
          /></div>
          <ExportPanel
            data={exportCandidate.data}
            disabledReason={pathsOutOfBounds ? "路径超出画框范围，修正图片位置后重新生成。" : exportCandidate.error}
          />
          <section className="panel order-panel" hidden={colorMode}>
            <div className="panel-title">路径执行顺序 <small>固定顺序</small></div>
            <div className="order-list">
              {colorOrder.map((color, index) => (
                <div
                  className="order-item"
                  key={color}
                >
                  <span className="order-index">{index + 1}</span>
                  <i style={{ backgroundColor: COLOR_META[color].hex }} />
                  <span>{COLOR_META[color].label}</span>
                </div>
              ))}
            </div>
            {imageOutOfBounds && (
              <div className="bounds-alert"><AlertTriangle size={15} />图片超出部分的落针点已自动忽略，不会上传</div>
            )}
            {previewMode === "path" && pathsOutOfBounds && (
              <div className="bounds-alert"><AlertTriangle size={15} />路径超出画框范围</div>
            )}
            {notice && <p className="right-note">{notice}</p>}
          </section>
        </aside>
        {page === "serial" && <section className="serial-page"><div className="serial-inspection"><SerialCapturePanel embedded /><StabilityPanel/></div></section>}
        {page === "data" && <DataTransferPage data={exportCandidate.data} stepsPerMm={stepsPerMm} disabledReason={exportCandidate.error}/>}
      </section>
      {showArtworkCreator && (
        <ArtworkCreator
          onClose={() => setShowArtworkCreator(false)}
          onUseArtwork={(file, keepSmallDetails, ordered, preset, generated) => {
            loadFile(file, keepSmallDetails, ordered, preset, generated);
            setShowArtworkCreator(false);
          }}
        />
      )}
    </main>
  );
}

export default App;

