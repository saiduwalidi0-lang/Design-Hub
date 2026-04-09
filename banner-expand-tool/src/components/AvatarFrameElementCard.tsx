import { type CSSProperties } from "react";
import { ChevronDown, ChevronUp, Copy, RotateCcw, Sparkles } from "lucide-react";
import Button from "@/components/Button";
import type { AvatarFrameElement, AvatarFrameLevel } from "@/types/avatarFrameTool";
import { avatarFrameLevelIncludesTop } from "@/utils/avatarFrameLevelSpec";
import { dataUrlToBlob } from "@/utils/image";

function pickPrimaryFigmaFillUrl(el: AvatarFrameElement): string | undefined {
  const order: AvatarFrameLevel[] = ["L", "M", "S"];
  for (const level of order) {
    if (el.id === "element3" && !avatarFrameLevelIncludesTop(level)) continue;
    const url = el.figmaFillByLevel?.[level] ?? (level === "L" ? el.figmaFillDataUrl : undefined);
    if (url) return url;
  }
  return undefined;
}

type AvatarFrameElementCardProps = {
  el: AvatarFrameElement;
  expanded: boolean;
  disabled?: boolean;
  batchOnly?: boolean;
  disableReorder?: boolean;
  aiEnabled: boolean;
  aiDone: boolean;
  aiPrompt: string;
  setAiPrompt: (v: string) => void;
  aiLoading: boolean;
  aiError?: string;
  onAiEdit: () => void;
  disableTransforms?: boolean;
  onExpand: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPatch: (patch: Partial<AvatarFrameElement>) => void;
  onResetTransform: () => void;
  onResetGenerated: () => void;
  onSelectGenerated: (dataUrl: string) => void;
  onSelectCropped: (dataUrl: string) => void;
  onSelectFigmaFill: (dataUrl: string) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatNumber(n: number) {
  if (!Number.isFinite(n)) return "";
  const s = String(n);
  return s.length > 12 ? n.toFixed(2) : s;
}

const checkerboardStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
  backgroundSize: "18px 18px",
  backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
};

export default function AvatarFrameElementCard(props: AvatarFrameElementCardProps) {
  const primaryFigmaFill = pickPrimaryFigmaFillUrl(props.el);

  async function copyImage(dataUrl: string) {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error("复制失败");
      const blob = dataUrlToBlob(dataUrl);
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/40 text-xs">
      <div className="flex w-full items-center justify-between gap-2 px-3 py-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={props.onExpand}>
          <div className="truncate text-xs font-medium text-zinc-100">
            {props.el.label}
            {props.el.required ? <span className="ml-2 text-xs text-rose-200">必填</span> : null}
            {props.aiDone ? <span className="ml-2 text-xs text-emerald-200">已 AI</span> : null}
          </div>
        </button>

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-500"
              checked={props.el.visible}
              onChange={(e) => props.onPatch({ visible: e.target.checked })}
              disabled={props.disabled}
            />
            显示
          </label>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={props.onMoveUp}
            disabled={props.disabled || props.disableReorder}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={props.onMoveDown}
            disabled={props.disabled || props.disableReorder}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {props.expanded ? (
        <div className="grid gap-2 border-t border-white/10 px-3 py-2">
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-200">Figma 填充</div>
            <div
              className="mx-auto flex aspect-square w-full max-w-[200px] items-center justify-center overflow-hidden rounded-md border border-white/10"
              style={checkerboardStyle}
              title={primaryFigmaFill ? "点击预览" : "未生成"}
            >
              {primaryFigmaFill ? (
                <button
                  type="button"
                  className="flex h-full w-full items-center justify-center p-0.5"
                  onClick={() => window.open(primaryFigmaFill, "_blank", "noopener,noreferrer")}
                  disabled={props.disabled}
                >
                  <img src={primaryFigmaFill} alt="" className="max-h-full max-w-full object-contain" />
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="ghost"
                type="button"
                disabled={props.disabled || !primaryFigmaFill}
                onClick={() => primaryFigmaFill && void copyImage(primaryFigmaFill)}
              >
                <Copy className="h-4 w-4" />
                复制填充图
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" type="button" disabled={props.disabled} onClick={props.onResetTransform}>
              <RotateCcw className="h-4 w-4" />
              重置变换
            </Button>
            <Button
              variant="ghost"
              type="button"
              disabled={props.disabled || !props.el.generatedDataUrl}
              onClick={props.onResetGenerated}
            >
              清除生成
            </Button>
          </div>

          {!props.disableTransforms ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-200">X</div>
                <input
                  type="number"
                  value={formatNumber(props.el.x)}
                  onChange={(e) => props.onPatch({ x: clamp(Number(e.target.value || 0), -500, 500) })}
                  disabled={props.disabled}
                  className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-200">Y</div>
                <input
                  type="number"
                  value={formatNumber(props.el.y)}
                  onChange={(e) => props.onPatch({ y: clamp(Number(e.target.value || 0), -500, 500) })}
                  disabled={props.disabled}
                  className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-200">缩放</div>
                <input
                  type="number"
                  step="0.05"
                  value={formatNumber(props.el.scale)}
                  onChange={(e) => props.onPatch({ scale: clamp(Number(e.target.value || 1), 0.05, 3) })}
                  disabled={props.disabled}
                  className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-200">旋转（deg）</div>
                <input
                  type="number"
                  value={formatNumber(props.el.rotate)}
                  onChange={(e) => props.onPatch({ rotate: clamp(Number(e.target.value || 0), -360, 360) })}
                  disabled={props.disabled}
                  className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
                />
              </label>
            </div>
          ) : null}

          <div className="grid gap-2">
            <div className="text-xs font-medium text-zinc-200">描述词</div>
            <textarea
              value={props.aiPrompt}
              onChange={(e) => props.setAiPrompt(e.target.value)}
              rows={3}
              disabled={props.disabled}
              className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
              placeholder=""
            />
            {!props.batchOnly ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={
                    props.disabled ||
                    props.aiLoading ||
                    !props.aiEnabled ||
                    !props.el.dataUrl ||
                    props.aiPrompt.trim().length === 0
                  }
                  onClick={props.onAiEdit}
                >
                  <Sparkles className="h-4 w-4" />
                  {props.aiLoading ? "编辑中…" : "AI 编辑并回填"}
                </Button>
              </div>
            ) : null}
            {props.aiError ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {props.aiError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
