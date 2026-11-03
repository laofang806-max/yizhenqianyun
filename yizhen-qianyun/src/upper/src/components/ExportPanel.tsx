import { Download } from "lucide-react";
import { useState } from "react";
import type { StandardizedEmbroidery } from "../types/exportData";
import { encodeEmbroideryBin } from "../utils/binProtocol";
import { downloadBlob } from "../utils/fileDownload";
import { serializeEmbroideryJson } from "../utils/pathExport";

type ExportResult = {
  filename: string;
  bytes: number;
  status: string;
};

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function ExportPanel({
  data,
  disabledReason,
}: {
  data: StandardizedEmbroidery | null;
  disabledReason: string;
}) {
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState("");

  const exportFile = (format: "json" | "bin") => {
    if (!data) return;
    try {
      const filename = `embroidery_path.${format}`;
      const blob = format === "json"
        ? new Blob([serializeEmbroideryJson(data)], { type: "application/json;charset=utf-8" })
        : new Blob([encodeEmbroideryBin(data)], { type: "application/octet-stream" });
      downloadBlob(blob, filename);
      setResult({
        filename,
        bytes: blob.size,
        status: "导出成功",
      });
      setError("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "文件生成失败。";
      setError(message);
      setResult(null);
    }
  };

  return (
    <section className="panel export-panel">
      <div className="panel-title"><Download size={14} />{data?.metadata.thread ? "当前色层文件导出" : "路径文件导出"}</div>
      <div className="export-actions">
        <button type="button" disabled={!data} onClick={() => exportFile("json")}>导出 JSON</button>
        <button type="button" disabled={!data} onClick={() => exportFile("bin")}>导出 BIN</button>
      </div>
      {!data && <p className="export-disabled-reason">{disabledReason}</p>}
      {data && <p className="export-point-count">当前路径点：{data.statistics.totalCommandPointCount}</p>}
      {result && (
        <p className="export-result" role="status">
          {result.status} · {result.filename} · {formatBytes(result.bytes)} · {data?.statistics.totalCommandPointCount ?? 0} 点
        </p>
      )}
      {error && <p className="panel-error" role="alert">{error}</p>}
    </section>
  );
}
