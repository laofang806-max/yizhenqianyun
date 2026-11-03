import { Camera, CircleStop, Download, Usb } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CAMERA_STREAM, CameraStreamDecoder, describeCameraStatus, describeCameraReadback, yuyvToRgba } from "../utils/cameraStream";

export function CameraCapturePanel({ onUsePhoto }: { onUsePhoto: (file: File) => void }) {
  useEffect(() => {
    if(window.location.hash === "#camera") document.getElementById("camera")?.scrollIntoView({block:"start"});
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const latestSequenceRef = useRef<number | null>(null);
  const capturedUrlRef = useRef("");
  const mountedRef = useRef(true);
  const captureRequestRef = useRef(0);
  const lastFrameAtRef = useRef(0);
  const diagnosticRef = useRef("");
  const registerValuesRef = useRef(0);
  const [readbackDetails, setReadbackDetails] = useState("");
  const [diagnostic, setDiagnostic] = useState("");
  const [connection, setConnection] = useState<"idle" | "connecting" | "connected">("idle");
  const [hasFrame, setHasFrame] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<File | null>(null);
  const [capturedUrl, setCapturedUrl] = useState("");
  const [status, setStatus] = useState("相机未连接");
  const [error, setError] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      captureRequestRef.current += 1;
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
      if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (connection === "idle") return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastFrameAtRef.current > 8000) {
        setHasFrame(false);
        latestSequenceRef.current = null;
        setError(connection === "connecting"
          ? "连接超时，请确认相机桥接服务已启动，可断开后重试。"
          : diagnosticRef.current || "8 秒内未收到完整画面，也未收到板端状态；请确认已下载带状态回传的新固件。");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connection]);

  const capture = (sequence: number, source: string) => {
    const canvas = canvasRef.current;
    if (!canvas || latestSequenceRef.current !== sequence) {
      setError("拍照事件对应的画面未收到，请等待下一帧后重新拍摄。");
      return;
    }
    // Copy immediately so subsequent preview frames cannot change this photo.
    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const context = snapshot.getContext("2d");
    if (!context) { setError("无法创建照片画布。"); return; }
    context.drawImage(canvas, 0, 0);
    const request = ++captureRequestRef.current;
    snapshot.toBlob((blob) => {
      if (!mountedRef.current || request !== captureRequestRef.current) return;
      if (!blob) { setError("无法保存摄像头画面，请重试。"); return; }
      const photo = new File([blob], `ov5640-${Date.now()}-${sequence}.png`, { type: "image/png" });
      if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
      capturedUrlRef.current = URL.createObjectURL(photo);
      setCapturedPhoto(photo);
      setCapturedUrl(capturedUrlRef.current);
      setError("");
      setStatus(`${source} 已拍摄 · 第 ${sequence} 帧，可选择作为刺绣图片`);
    }, "image/png");
  };

  const disconnect = () => {
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
    latestSequenceRef.current = null;
    setHasFrame(false);
    setConnection("idle");
    setStatus("相机已断开，已拍照片仍可使用");
  };

  const connect = () => {
    if (socketRef.current) return;
    setError("");
    diagnosticRef.current = "";
    setDiagnostic("");
    setReadbackDetails("");
    registerValuesRef.current = 0;
    setHasFrame(false);
    latestSequenceRef.current = null;
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, CAMERA_STREAM.width, CAMERA_STREAM.height);
    const decoder = new CameraStreamDecoder();
    const socket = new WebSocket("ws://127.0.0.1:8765/camera");
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;
    lastFrameAtRef.current = Date.now();
    setConnection("connecting");
    setStatus("正在连接 FT232HL 相机桥接服务…");
    socket.onopen = () => {
      if (socketRef.current !== socket) return;
      setConnection("connected");
      setStatus("已连接，等待 OV5640 画面…");
    };
    socket.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (socketRef.current !== socket || !(event.data instanceof ArrayBuffer)) return;
      try {
        for (const packet of decoder.push(new Uint8Array(event.data))) {
          if (packet.type === "frame") {
            const context = canvasRef.current?.getContext("2d");
            if (!context) continue;
            context.putImageData(new ImageData(yuyvToRgba(packet.pixels), CAMERA_STREAM.width, CAMERA_STREAM.height), 0, 0);
            latestSequenceRef.current = packet.sequence;
            lastFrameAtRef.current = Date.now();
            setHasFrame(true);
            setError("");
            setStatus(`实时画面 · 640 × 480 · 第 ${packet.sequence} 帧`);
          } else if (packet.type === "capture") {
            capture(packet.sequence, "板上 KEY2");
          } else if (packet.type === "registers") {
            registerValuesRef.current = packet.values;
          } else if (packet.type === "activity") {
            setReadbackDetails(describeCameraReadback(registerValuesRef.current, packet.values));
          } else {
            const message = describeCameraStatus(packet.flags);
            diagnosticRef.current = message;
            setDiagnostic(message);
            if (packet.flags & 2) setError(message);
            if (latestSequenceRef.current === null) setStatus(message);
          }
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "摄像头数据解析失败。");
      }
    };
    socket.onerror = () => {
      if (socketRef.current !== socket) return;
      setError("无法连接相机桥接服务，请确认 host/camera_bridge.py 正在运行，且未被其他页面占用。");
    };
    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      latestSequenceRef.current = null;
      setHasFrame(false);
      setConnection("idle");
      setStatus("相机已断开，已拍照片仍可使用");
    };
  };

  return (
    <section id="camera" className="panel camera-capture-panel" style={{scrollMarginTop:24}}>
      <div className="panel-title"><Camera size={14} />板载 OV5640 摄像头</div>
      <div className="camera-preview-wrap">
        <canvas ref={canvasRef} className="camera-preview" width={CAMERA_STREAM.width} height={CAMERA_STREAM.height} aria-label="OV5640 实时画面" />
        {!hasFrame && <span className="camera-preview-empty"><Camera size={20} />{connection === "idle" ? "等待相机连接" : "等待完整画面"}</span>}
      </div>
      <div className="camera-status-row" role="status">
        <span className={`device-indicator ${hasFrame ? "device-online" : ""}`} /><span>{status}</span>
      </div>
      <div className="camera-actions">
        {connection === "idle"
          ? <button type="button" onClick={connect}><Usb size={13} />连接相机</button>
          : <button type="button" onClick={disconnect}><CircleStop size={13} />{connection === "connecting" ? "取消连接" : "断开"}</button>}
        <button type="button" disabled={!hasFrame} onClick={() => {
          if (latestSequenceRef.current !== null) capture(latestSequenceRef.current, "上位机");
        }}><Camera size={13} />拍照</button>
      </div>
      {diagnostic && <p className="camera-help" role="status">板端状态：{diagnostic}</p>}
      {readbackDetails && <p className="camera-help">传感器读回：{readbackDetails}</p>}
      <p className="camera-help">连接 USB Slave 并启动桥接服务；按开发板 KEY2 拍照，预览继续更新。</p>
      {capturedPhoto && capturedUrl && <div className="camera-photo-selection">
        <img src={capturedUrl} alt="已拍摄的刺绣候选照片" />
        <div className="camera-actions">
          <button className="camera-use-button" type="button" onClick={() => onUsePhoto(capturedPhoto)}>选为刺绣图片</button>
          <a href={capturedUrl} download={capturedPhoto.name}><Download size={13} />保存照片</a>
        </div>
        <p className="camera-help">选用后自动生成针迹，可调整位置、缩放或编辑针点后上传。</p>
      </div>}
      {error && <p className="panel-error" role="alert">{error}</p>}
    </section>
  );
}
