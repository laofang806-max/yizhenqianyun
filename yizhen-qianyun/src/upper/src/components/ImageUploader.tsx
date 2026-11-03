import { ImagePlus, Upload } from "lucide-react";
import type { DragEvent } from "react";
import type { RefObject } from "react";
import type { ReactNode } from "react";

type ImageUploaderProps = {
  fileInputRef: RefObject<HTMLInputElement>;
  imageName: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  fileSize: string;
  error: string;
  onSelect: (file?: File) => void;
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageUploader({
  fileInputRef,
  imageName,
  imageUrl,
  imageWidth,
  imageHeight,
  fileSize,
  error,
  onSelect,
}: ImageUploaderProps) {
  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onSelect(event.dataTransfer.files[0]);
  };

  let content: ReactNode;
  if (imageUrl) {
    content = (
      <div className="image-file-card">
        <img src={imageUrl} alt="刺绣图案缩略图" />
        <div className="image-file-info">
          <strong title={imageName}>{imageName}</strong>
          <span>原始尺寸：{imageWidth} × {imageHeight} px</span>
          <span>文件大小：{fileSize}</span>
        </div>
      </div>
    );
  } else {
    content = (
      <span className="upload-empty">
        <ImagePlus size={19} />
        <span>选择图片或拖放到此处</span>
        <small>PNG / JPG / JPEG / BMP</small>
      </span>
    );
  }

  return (
    <section className="panel">
      <div className="panel-title"><Upload size={14} /> 图片上传 <span className="panel-chevron">⌃</span></div>
      <button
        className="upload-dropzone"
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        {content}
      </button>
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/bmp,.png,.jpg,.jpeg,.bmp"
        onChange={(event) => {
          onSelect(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {error && <p className="panel-error" role="alert">{error}</p>}
    </section>
  );
}
