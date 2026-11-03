import { runtimeMetrics } from "./runtimeMetrics";
export type CaptureEntry = {
  id: string;
  time: string;
  elapsedMs: number;
  direction: "TX" | "RX" | "EVENT";
  label: string;
  bytes: number;
  hex: string;
  text: string;
};
const session = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const started = performance.now();
let sequence = 0;
let recent: CaptureEntry[] = [];
let txBytes = 0, rxBytes = 0, records = 0;
let storageError = "";
let queue: Promise<void> = Promise.resolve();
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  return dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("xiangxiu-serial-capture", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("packets", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开抓包存储"));
    request.onblocked = () => reject(new Error("抓包存储被其他页面阻塞"));
  });
}
function transaction(db: IDBDatabase, operation: (store: IDBObjectStore) => void) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("packets", "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("抓包存储写入失败"));
    tx.onabort = () => reject(tx.error ?? new Error("抓包存储已中断"));
    operation(tx.objectStore("packets"));
  });
}
function persist(operation: (db: IDBDatabase) => Promise<void>) {
  queue = queue.then(async () => operation(await database())).catch((cause: unknown) => {
    storageError = `${cause instanceof Error ? cause.message : String(cause)}；磁盘日志可能不完整，请导出当前缓存。`;
  });
}
export function captureSerial(direction: CaptureEntry["direction"], label: string, data?: Uint8Array) {
  const entry: CaptureEntry = {
    id: `${session}-${String(++sequence).padStart(10, "0")}`,
    time: new Date().toISOString(), elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
    direction, label, bytes: data?.byteLength ?? 0,
    hex: data ? Array.from(data, byte => byte.toString(16).padStart(2, "0")).join(" ") : "",
    text: data ? new TextDecoder().decode(data) : "",
  };
  recent.push(entry);
  if (recent.length > 2000) recent = recent.slice(-2000);
  records++;
  if (direction === "TX") txBytes += entry.bytes;
  if (direction === "RX") rxBytes += entry.bytes;
  persist(db => transaction(db, store => store.add(entry)));
  return entry.id;
}
export async function capturedSerialWrite(writer: WritableStreamDefaultWriter<Uint8Array>, data: Uint8Array, label: string) {
  const id = captureSerial("TX", `${label} · 写入请求`, data);
  try {
    await writer.write(data);
    captureSerial("EVENT", `WRITE_OK ${id} · 浏览器写入完成，板卡是否接收须看RX应答`);
  } catch (cause) {
    runtimeMetrics.writeError();
    captureSerial("EVENT", `WRITE_ERROR ${id} · ${cause instanceof Error ? cause.message : String(cause)}`);
    throw cause;
  }
}
export function captureSnapshot() { return { recent: [...recent], txBytes, rxBytes, records, storageError }; }
export async function clearCapture() {
  const clearing = queue.then(async () => transaction(await database(), store => store.clear()));
  queue = clearing.catch((cause: unknown) => { storageError = String(cause); });
  recent = []; txBytes = 0; rxBytes = 0; records = 0; storageError = "";
  await clearing;
}
export async function exportCapture(format: "jsonl" | "txt", memoryOnly = false) {
  await queue;
  let entries: CaptureEntry[];
  if (memoryOnly) entries = [...recent];
  else {
    const db = await database();
    entries = await new Promise<CaptureEntry[]>((resolve, reject) => {
      const request = db.transaction("packets").objectStore("packets").getAll();
      request.onsuccess = () => resolve(request.result as CaptureEntry[]);
      request.onerror = () => reject(request.error);
    });
  }
  entries.sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  const output = format === "jsonl"
    ? entries.map(entry => JSON.stringify(entry)).join("\n")
    : entries.map(entry => `[${entry.time}] ${entry.id} ${entry.direction} ${entry.bytes}B ${entry.label}\nTEXT ${JSON.stringify(entry.text)}\nHEX  ${entry.hex}\n`).join("\n");
  const url = URL.createObjectURL(new Blob([output], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url;
  link.download = `xiangxiu-serial-${new Date().toISOString().replace(/[:.]/g, "-")}${memoryOnly ? "-recent-cache" : ""}.${format}`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
