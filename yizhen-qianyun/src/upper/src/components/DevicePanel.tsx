import { runtimeMetrics } from "../utils/runtimeMetrics";
import { captureSerial, capturedSerialWrite } from "../utils/serialCapture";
import { Cable, CircleStop, Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EmbroideryColor } from "../types/embroidery";
import type { StandardizedEmbroidery } from "../types/exportData";
import { parseEncoderLine, encoderDisplacement, type EncoderReading } from "../utils/encoderTelemetry";
import { buildColorText, getNextDeviceColor } from "../utils/deviceProtocol";

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
};

type NavigatorWithSerial = Navigator & {
  serial?: { requestPort(): Promise<SerialPortLike> };
};

const LABEL: Record<EmbroideryColor, string> = {
  black: "黑色",
  red: "红色",
  blue: "蓝色",
  yellow: "黄色",
};

const isEmbroideryColor = (value: string): value is EmbroideryColor =>
  value === "black" || value === "red" || value === "yellow" || value === "blue";

export function DevicePanel({
  data,
  disabledReason,
  stepsPerMm,
  onStepsPerMmChange,
  onTaskLockChange, onThreadDone,
}: {
  data: StandardizedEmbroidery | null;
  disabledReason: string;
  stepsPerMm: number;
  onStepsPerMmChange: (value: number) => void;
  onTaskLockChange: (value:boolean)=>void;
  onThreadDone: (id:string)=>void;
}) {
  const [capabilities,setCapabilities] = useState<string[]>([]);
  const [monitoring,setMonitoring] = useState(false);
  const [taskLocked,setTaskLocked] = useState(false);
  const pendingThreadRef=useRef<string|null>(null);
  const resetRequestedRef=useRef(false);
  const dataRef=useRef(data);dataRef.current=data;
  useEffect(()=>onTaskLockChange(taskLocked),[taskLocked,onTaskLockChange]);
  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const statusPollRef = useRef<number | null>(null);
  const uploadTimeoutRef = useRef<number | null>(null);
  const statusWritePendingRef = useRef(false);
  const receiveBufferRef = useRef("");
  const completedColorsRef = useRef<EmbroideryColor[]>([]);
  const executionOrderRef = useRef<readonly EmbroideryColor[]>([]);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [encoder, setEncoder] = useState<EncoderReading | null>(null);
  const [encoderZero, setEncoderZero] = useState({x: 0, y: 0});
  const [encoderNow, setEncoderNow] = useState(Date.now());
  const [invertEncoderX, setInvertEncoderX] = useState(false);
  const [invertEncoderY, setInvertEncoderY] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setEncoderNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const [nextColor, setNextColor] = useState<EmbroideryColor | null>(null);
  const [status, setStatus] = useState("连接板卡后等待就绪；无回零模式需先手动将 X/Y 放在行程中点。");
  const [error, setError] = useState("");
  const [lastMessage, setLastMessage] = useState("");

  useEffect(() => {
    executionOrderRef.current = data?.metadata.thread ? ["black"] : data?.executionOrder ?? [];
    if(data?.metadata.thread)completedColorsRef.current=[];
    setNextColor(getNextDeviceColor(completedColorsRef.current, executionOrderRef.current));
  }, [data?.executionOrder,data?.metadata.thread?.id]);

  useEffect(() => () => {
    if (statusPollRef.current !== null) window.clearInterval(statusPollRef.current);
    if (uploadTimeoutRef.current !== null) window.clearTimeout(uploadTimeoutRef.current);
    void readerRef.current?.cancel().catch(() => undefined);
    writerRef.current?.releaseLock();
    if (portRef.current) void portRef.current.close().catch(() => undefined);
  }, []);

  const clearUploadTimeout = () => {
    if (uploadTimeoutRef.current !== null) {
      window.clearTimeout(uploadTimeoutRef.current);
      uploadTimeoutRef.current = null;
    }
  };

  const stopStatusPolling = () => {
    if (statusPollRef.current !== null) {
      window.clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  };

  const startStatusPolling = () => {
    if (statusPollRef.current !== null || !writerRef.current) return;
    const requestStatus = () => {
      if (statusWritePendingRef.current || !writerRef.current) return;
      statusWritePendingRef.current = true;
      void capturedSerialWrite(writerRef.current, new TextEncoder().encode("STATUS?\n"), "状态查询")
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "状态查询发送失败。");
          stopStatusPolling();
        })
        .finally(() => {
          statusWritePendingRef.current = false;
        });
    };
    requestStatus();
    statusPollRef.current = window.setInterval(requestStatus, 500);
  };

  const disconnect = async (unexpected=false) => {
    runtimeMetrics.connected(false,unexpected);setMonitoring(false);setCapabilities([]);setTaskLocked(false);
    if (portRef.current) captureSerial("EVENT", "断开串口连接");
    stopStatusPolling();
    clearUploadTimeout();
    await readerRef.current?.cancel().catch(() => undefined);
    readerRef.current?.releaseLock();
    readerRef.current = null;
    writerRef.current?.releaseLock();
    writerRef.current = null;
    if (portRef.current) await portRef.current.close().catch(() => undefined);
    portRef.current = null;
    setEncoder(null);
    setConnected(false);
    setReady(false);
    setBusy(false);
  };

  useEffect(()=>{
    runtimeMetrics.monitoring(monitoring && connected && capabilities.includes("PING"));
    if(!monitoring || !connected || !capabilities.includes("PING"))return;
    const timer=setInterval(()=>{
      if(busy || !writerRef.current)return;
      const command=runtimeMetrics.probe();if(!command)return;
      void capturedSerialWrite(writerRef.current,new TextEncoder().encode(command),"持续响应探测").catch(()=>undefined);
    },1000);
    return()=>{clearInterval(timer);runtimeMetrics.monitoring(false);};
  },[monitoring,connected,capabilities,busy]);
  const resetTask=async()=>{
    if(!writerRef.current || !capabilities.includes("RESET"))return;
    if(!confirm("任务复位会立即停止输出、清空缓存，并将当前位置设为新的软件原点。请先抬针、抬压脚，确认平台位置；复位后不会自动回程或运行。继续？"))return;
    try{resetRequestedRef.current=true;clearUploadTimeout();completedColorsRef.current=[];pendingThreadRef.current=null;
      setReady(false);setBusy(false);setTaskLocked(false);receiveBufferRef.current="";
      await capturedSerialWrite(writerRef.current,new TextEncoder().encode("RESET\n"),"任务复位（保留FPGA配置）");
      setStatus("已发送任务复位，正在等待READY；当前点成为新软件原点，请确认实际平台位置。");
      startStatusPolling();
    }catch(cause){setError(cause instanceof Error?cause.message:"复位发送失败");}
  };
  const connect = async () => {
    const serial = (navigator as NavigatorWithSerial).serial;
    if (!serial) {
      setError("当前浏览器不支持 Web Serial。请使用最新版 Chrome 或 Edge，并通过 localhost/HTTPS 打开页面。");
      return;
    }
    setError("");
    try {
      const port = await serial.requestPort();
      await port.open({ baudRate: 115200 });
      if (!port.readable || !port.writable) throw new Error("串口读写流不可用。");
      portRef.current = port;
      readerRef.current = port.readable.getReader();
      writerRef.current = port.writable.getWriter();
      receiveBufferRef.current = "";
      setEncoder(null);
      setEncoderZero({x: 0, y: 0});
      setConnected(true);
      setReady(false);
      setStatus("串口已连接，正在查询 FPGA 状态。");
      captureSerial("EVENT", "串口已连接 · 115200 8N1");
      runtimeMetrics.connected(true);
      await capturedSerialWrite(writerRef.current,new TextEncoder().encode("CAP?\n"),"查询固件能力");
      startStatusPolling();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await readerRef.current.read();
        if (done) throw new Error("开发板串口读取流已关闭，设备可能已断开。");
        if (!value) continue;
        captureSerial("RX", "串口原始读取块", value);
        receiveBufferRef.current += decoder.decode(value, { stream: true });
        const lines = receiveBufferRef.current.split(/\r?\n/);
        receiveBufferRef.current = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          runtimeMetrics.line(line);
          if(line.startsWith("CAP ")){setCapabilities(line.slice(4).split(" "));continue;}
          if(/^PONG [0-9A-Fa-f]{4}$/.test(line))continue;
          const reading = parseEncoderLine(line);
          if (reading) { setEncoder({...reading, receivedAt: Date.now()}); continue; }
          setLastMessage(line);
          if (line === "READY") {
            if(resetRequestedRef.current){resetRequestedRef.current=false;setTaskLocked(false);completedColorsRef.current=[];setNextColor(getNextDeviceColor([],executionOrderRef.current));}
            clearUploadTimeout();
            stopStatusPolling();
            setReady(true);
            setError("");
            setStatus("板卡已就绪；确认 X/Y 仍在行程中点后发送路径。");
          } else if (line.startsWith("OK ")) {
            clearUploadTimeout();
            stopStatusPolling();
            setBusy(false);
            setReady(false);
            setStatus(`${line.slice(3)==="layer" ? dataRef.current?.metadata.thread?.label ?? "当前色层" : line.slice(3)}路径已缓存；请按板上启动键开始刺绣。`);
          } else if (line === "CORRECT") {
            setReady(false);setStatus("编码器检测到位置偏差，FPGA 正在低速自动纠偏；到位前不下针、不继续路径。");
          } else if (line === "NEXT") {
            setStatus("已完成一针，FPGA 正在继续执行缓存路径。");
          } else if (line === "BUSY") {
            setReady(false);
            setStatus("FPGA 正在接收数据或运动；等待 READY。");
          } else if (line.startsWith("DONE ")) {
            const layerReply=line.slice(5)==="layer";
            const reportedColor = layerReply ? "black" : line.slice(5);
            setTaskLocked(false);
            if(layerReply&&pendingThreadRef.current){onThreadDone(pendingThreadRef.current);pendingThreadRef.current=null;}
            if (!isEmbroideryColor(reportedColor)) {
              setError(`板卡返回了未知颜色：${reportedColor}`);
              continue;
            }
            const completedColor = reportedColor;
            const updatedCompletedColors = completedColorsRef.current.includes(completedColor)
              ? completedColorsRef.current
              : [...completedColorsRef.current, completedColor];
            completedColorsRef.current = updatedCompletedColors;
            const following = getNextDeviceColor(
              updatedCompletedColors,
              executionOrderRef.current,
            );
            setNextColor(following);
            if (following) {
              setReady(false);
              setStatus(`${LABEL[completedColor]}完成并返回上电时的软件原点；剪线/换线后发送${LABEL[following]}路径。`);
              startStatusPolling();
            } else {
              stopStatusPolling();
              setReady(false);
              setStatus(layerReply ? "当前色层已完成并返回原点；换线后在工作台选择下一色层，按KEY0确认后再上传。" : "四色刺绣完成，等待 ALL DONE。");
            }
          } else if (line === "ALL DONE") {
            clearUploadTimeout();
            stopStatusPolling();
            setNextColor(null);
            setReady(false);
            setStatus("黑、红、黄、蓝四色全部完成。");
          } else if (line === "ESTOP") {
            setBusy(false);
            setReady(false);
            setStatus("急停已触发；松开急停后按启动键继续。");
            startStatusPolling();
          } else if (line.startsWith("ERR")) {
            clearUploadTimeout();
            setBusy(false);
            setReady(false);
            setError(line === "ERR feedback" ? "编码器纠偏失败，已停止且禁止下针。请检查22V电源、A/B接线及机械卡滞；排除原因后重新定位、复位并上传任务。" : `FPGA 报错：${line}`);
            startStatusPolling();
          }
        }
      }
    } catch (cause) {
      captureSerial("EVENT", `串口连接/读取错误 · ${cause instanceof Error ? cause.message : String(cause)}`);
      setError(cause instanceof Error ? cause.message : "串口连接失败。");
      await disconnect(true);
    }
  };

  const sendNextColor = async () => {
    if (!data || !writerRef.current || busy || !nextColor) return;
    setError("");
    let payload: string;
    try {
      payload = buildColorText(data, nextColor, stepsPerMm);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "路径编码或串口发送失败。");
      return;
    }
    const writer = writerRef.current;
    if (!writer) return;
    setBusy(true);
    setReady(false);
    setStatus(`正在发送${LABEL[nextColor]}路径到 FPGA，等待板卡确认…`);
    uploadTimeoutRef.current = window.setTimeout(() => {
      uploadTimeoutRef.current = null;
      setBusy(false);
      setError("30 秒内未收到 FPGA 的 OK/ERR 应答。请检查板卡供电、串口回传和 FPGA 状态；不要盲目重复发送。");
      setStatus("上传未确认，正在查询板卡状态…");
      startStatusPolling();
    }, 30_000);
    try {
      pendingThreadRef.current=data.metadata.thread?.id??null;
      setTaskLocked(true);runtimeMetrics.upload();
      await capturedSerialWrite(writer, new TextEncoder().encode(payload), `路径上传 ${nextColor} · ${stepsPerMm} STEP/mm`);
    } catch (cause) {
      clearUploadTimeout();
      setBusy(false);
      setError(cause instanceof Error ? `串口发送失败：${cause.message}` : "串口发送失败。");
      await disconnect(true);
    }
  };

  const browserSupported = !!(navigator as NavigatorWithSerial).serial;

  return (
    <section className="panel device-panel">
      <div className="panel-title"><Cable size={14} />FPGA 设备控制</div>
      <div className="device-connect-row">
        <span className={`device-indicator ${connected ? "device-online" : ""}`} />
        <span>{connected ? "串口已连接 · 115200 8N1" : "未连接板卡"}</span>
        {!connected ? (
          <button type="button" onClick={connect} disabled={!browserSupported}>
            <Radio size={13} />连接
          </button>
        ) : (
          <button type="button" onClick={() => void disconnect()}>
            <CircleStop size={13} />断开
          </button>
        )}
      </div>
      <div className="device-reset-tools"><button type="button" disabled={!connected||!capabilities.includes("RESET")} onClick={()=>void resetTask()}>任务复位 · 保留固件</button><label><input type="checkbox" checked={monitoring} disabled={!connected||!capabilities.includes("PING")} onChange={e=>setMonitoring(e.target.checked)}/>持续响应监测</label><small>{capabilities.length ? "固件支持："+capabilities.join(" / ") : "彩色色层、任务复位及响应探测需要下载新版固件。"}</small></div>
      <label className="device-step-field">
        电机标定
        <span><input
          type="number"
          min="0.01"
          max="10000"
          step="0.01"
          value={stepsPerMm}
          onChange={(event) => onStepsPerMmChange(Number(event.target.value))}
          disabled={busy||taskLocked}
        /> step/mm</span>
      </label>
      <p className="device-note">
        当前按 0.9°电机、32 细分、8 mm/转且 1:1 直连设置为 1600 step/mm。
        FPGA 软限程也按此值和 300 mm 行程编译；若修改标定值，须同步修改 fpga/board_top.v 的 MOTOR_STEPS_PER_MM 参数并重新生成 bitstream。
        无回零时需上电前手动将两轴置于行程中点，软件限程不能替代机械限位。
        1秒版固件LED3亮表示已到本针位置，约1秒后自动继续（需烧录新版bit；旧版仍按原停留时间执行）；仅提示，不等人工确认，也不检测针是否抬起。
      </p>
      <div className="encoder-readout" aria-label="编码器位移">
        <strong>编码器测得位移</strong>
        <p>{!encoder ? "等待编码器数据（需新版固件）" : encoderNow - encoder.receivedAt > 2000 ? "数据已过期，请检查板卡连接" : "计数接收中 · 按500计数/mm换算"}</p>
        <p>X：{encoder && encoderNow - encoder.receivedAt <= 2000 ? encoderDisplacement(encoder.x, encoderZero.x, invertEncoderX).toFixed(3) : "—"} mm</p>
        <p>Y：{encoder && encoderNow - encoder.receivedAt <= 2000 ? encoderDisplacement(encoder.y, encoderZero.y, invertEncoderY).toFixed(3) : "—"} mm</p>
        <label><input type="checkbox" checked={invertEncoderX} onChange={e => setInvertEncoderX(e.target.checked)} />X显示反向</label>{" "}
        <label><input type="checkbox" checked={invertEncoderY} onChange={e => setInvertEncoderY(e.target.checked)} />Y显示反向</label>
        <button type="button" disabled={!encoder || encoderNow - encoder.receivedAt > 2000} onClick={() => encoder && setEncoderZero({x: encoder.x, y: encoder.y})}>当前位置显示归零</button>
        <p className="device-note">首次接入需尺量校准。仅改变位移显示，不改变路径原点。未接编码器也可能显示0；每轴需各接一个编码器。轴转角换算不包含传动间隙或打滑。闭环版固件会在超差时低速纠偏，到位后才允许下针；旧固件仍只监测。FPGA复位后需重新显示归零。</p>
      </div>
      <button
        className="device-send-button"
        type="button"
        disabled={!connected || !ready || !data || !nextColor || busy || !Number.isFinite(stepsPerMm) || stepsPerMm <= 0 || (!!data?.metadata.thread && !capabilities.includes("LAYER"))}
        onClick={() => void sendNextColor()}
      >
        {busy ? "正在发送…" : nextColor ? `发送${data?.metadata.thread?.label ?? LABEL[nextColor]}路径` : data?.metadata.thread ? "当前色层已完成" : "四色路径已完成"}
      </button>
      {data?.metadata.thread && <p className="device-note">当前线色：{data.metadata.thread.label} {data.metadata.thread.hex}，单独发送此色层；需要支持LAYER的新固件。</p>}
      {!data && <p className="device-note">{disabledReason}</p>}
      {!browserSupported && <p className="device-note">设备串口需要最新版 Chrome/Edge，并通过 localhost 或 HTTPS 打开。</p>}
      {data && !connected && <p className="device-note">请先生成路径并连接开发板；急停、启动和换线由板上按键/人工操作。</p>}
      {status && <p className="device-status" role="status">{status}</p>}
      {lastMessage && <p className="device-last-message">板卡：{lastMessage}</p>}
      {error && <p className="panel-error" role="alert">{error}</p>}
    </section>
  );
}

