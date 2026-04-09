import { Upload } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

type DropzoneProps = {
  disabled?: boolean;
  previewDataUrl?: string;
  onFileSelected: (file: File | null) => void;
  /** 头像框等场景：缩小预览与占位高度，节省纵向空间 */
  variant?: "default" | "compact";
};

export default function Dropzone({ disabled, previewDataUrl, onFileSelected, variant = "default" }: DropzoneProps) {
  const compact = variant === "compact";
  const id = useId();
  const [dragOver, setDragOver] = useState(false);

  function onPick(files: FileList | null) {
    const file = files?.[0] ?? null;
    onFileSelected(file);
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-dashed bg-zinc-950/40",
        dragOver ? "border-indigo-400/60" : "border-white/15",
        disabled && "opacity-60"
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        onPick(e.dataTransfer.files);
      }}
    >
      <input
        id={id}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => onPick(e.target.files)}
      />

      {previewDataUrl ? (
        <div className={cn("grid gap-3", compact ? "gap-2 p-2" : "p-3")}>
          <div className="overflow-hidden rounded-md border border-white/10 bg-zinc-950">
            <img
              src={previewDataUrl}
              alt="upload"
              className={cn("w-full object-contain", compact ? "max-h-[120px]" : "max-h-[260px]")}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={id}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-zinc-50 transition hover:bg-white/10",
                disabled && "cursor-not-allowed"
              )}
            >
              <Upload className="h-4 w-4" />
              更换图片
            </label>
            <button
              type="button"
              className={cn(
                "h-9 rounded-md px-3 text-sm text-zinc-200 transition hover:bg-white/10",
                disabled && "cursor-not-allowed"
              )}
              onClick={() => onFileSelected(null)}
              disabled={disabled}
            >
              清除
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 px-4 text-center transition",
            compact ? "min-h-[100px] gap-1.5 py-4" : "h-[220px] gap-2",
            disabled && "cursor-not-allowed"
          )}
        >
          <div
            className={cn(
              "flex items-center justify-center rounded-full border border-white/10 bg-white/5",
              compact ? "h-8 w-8" : "h-10 w-10"
            )}
          >
            <Upload className={cn("text-zinc-200", compact ? "h-4 w-4" : "h-5 w-5")} />
          </div>
          <div className={cn("text-zinc-200", compact ? "text-xs" : "text-sm")}>
            拖拽图片到此处，或点击选择文件
          </div>
          <div className={cn("text-zinc-500", compact ? "text-[11px]" : "text-xs")}>支持 PNG/JPG/WebP 等常见格式</div>
        </label>
      )}
    </div>
  );
}

