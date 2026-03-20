import { ImagePlus, RotateCcw } from "lucide-react";
import Button from "@/components/Button";

type AvatarFramePreviewCardProps = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  previewWidth: number;
  previewHeight: number;
  errorText?: string;
  disabled?: boolean;
  previewMode: "frame" | "composite";
  setPreviewMode: (v: "frame" | "composite") => void;
  onUploadPlaceholder: (file: File | null) => void;
  onResetPlaceholder: () => void;
};

export default function AvatarFramePreviewCard(props: AvatarFramePreviewCardProps) {
  return (
    <div>
      <div className="rounded-lg border border-white/10 bg-zinc-950/40 p-3">
        <div
          className="flex items-center justify-center overflow-hidden rounded-md"
          style={{
            backgroundImage:
              "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
            backgroundSize: "24px 24px",
            backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
          }}
        >
          <canvas ref={props.canvasRef} className="block" />
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          预览尺寸 {props.previewWidth}×{props.previewHeight}（导出时宽度固定 1024，高度按比例）
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-400">
          <div>预览模式</div>
          <select
            value={props.previewMode}
            onChange={(e) => props.setPreviewMode(e.target.value === "composite" ? "composite" : "frame")}
            disabled={props.disabled}
            className="rounded-md border border-white/15 bg-zinc-950 px-2 py-1 text-xs text-zinc-50 outline-none transition focus:border-indigo-500/60"
          >
            <option value="frame">仅头像框</option>
            <option value="composite">合成预览（含占位头像）</option>
          </select>
        </div>
        {props.errorText ? (
          <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {props.errorText}
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="mb-2 text-xs font-medium text-zinc-200">占位头像</div>
        <div className="mb-2 text-xs text-zinc-500">仅在“合成预览/合成导出”中生效</div>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10">
            <ImagePlus className="h-4 w-4" />
            上传头像
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={props.disabled}
              onChange={(e) => props.onUploadPlaceholder(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button variant="ghost" type="button" disabled={props.disabled} onClick={props.onResetPlaceholder}>
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
        </div>
      </div>
    </div>
  );
}
