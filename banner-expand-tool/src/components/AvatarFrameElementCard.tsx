import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, RotateCcw, Sparkles } from "lucide-react";
import Button from "@/components/Button";
import type { AvatarFrameElement } from "@/types/avatarFrameTool";
import { dataUrlToBlob } from "@/utils/image";

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

export default function AvatarFrameElementCard(props: AvatarFrameElementCardProps) {
  const [copyHint, setCopyHint] = useState<string | null>(null);

  async function copyImage(dataUrl: string) {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error("复制失败");
      const blob = dataUrlToBlob(dataUrl);
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      setCopyHint("已复制到剪贴板");
      window.setTimeout(() => setCopyHint(null), 1600);
    } catch {
      setCopyHint("复制失败");
      window.setTimeout(() => setCopyHint(null), 2000);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/40">
      <div className="flex w-full items-center justify-between gap-2 px-3 py-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={props.onExpand}>
          <div className="truncate text-sm font-medium text-zinc-100">
            {props.el.label}
            {props.el.required ? <span className="ml-2 text-xs text-rose-200">必填</span> : null}
            {props.aiDone ? <span className="ml-2 text-xs text-emerald-200">已 AI</span> : null}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {props.el.dataUrl ? "默认素材" : "未设置"}
            {props.el.generatedDataUrl ? " · 已生成" : ""}
            {typeof props.el.naturalWidth === "number" && typeof props.el.naturalHeight === "number"
              ? ` · ${props.el.naturalWidth}×${props.el.naturalHeight}`
              : ""}
          </div>
        </button>

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-200">
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
        <div className="grid gap-3 border-t border-white/10 px-3 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-200">底图（默认）</div>
              <div
                className="overflow-hidden rounded-md border border-white/10"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
                  backgroundSize: "18px 18px",
                  backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
                }}
              >
                {props.el.dataUrl ? (
                  <img src={props.el.dataUrl} alt="default" className="block h-auto w-full" />
                ) : (
                  <div className="px-3 py-6 text-center text-xs text-zinc-500">未加载默认素材</div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-zinc-200">生成结果</div>
              <div
                className="overflow-hidden rounded-md border border-white/10"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
                  backgroundSize: "18px 18px",
                  backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
                }}
              >
                {props.el.generatedDataUrl ? (
                  <img src={props.el.generatedDataUrl} alt="generated" className="block h-auto w-full" />
                ) : (
                  <div className="px-3 py-6 text-center text-xs text-zinc-500">未生成</div>
                )}
              </div>

              {props.el.generatedHistory && props.el.generatedHistory.length > 1 ? (
                <div className="mt-2">
                  <div className="mb-1 text-xs text-zinc-500">历史（点击切换）</div>
                  <div className="flex flex-wrap gap-2">
                    {props.el.generatedHistory.map((u, idx) => {
                      const active = u === props.el.generatedDataUrl;
                      return (
                        <button
                          key={`${idx}`}
                          type="button"
                          className={
                            active
                              ? "h-12 w-12 overflow-hidden rounded-md border border-indigo-500/50 bg-indigo-500/10"
                              : "h-12 w-12 overflow-hidden rounded-md border border-white/10 bg-white/5 hover:bg-white/10"
                          }
                          onClick={() => props.onSelectGenerated(u)}
                          disabled={props.disabled}
                          title={active ? "当前" : "点击切换"}
                        >
                          <img src={u} alt="history" className="block h-full w-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-zinc-200">裁剪后素材（像素边界）</div>
            <div
              className="overflow-hidden rounded-md border border-white/10"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
                backgroundSize: "18px 18px",
                backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
              }}
            >
              {props.el.croppedDataUrl ? (
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => window.open(props.el.croppedDataUrl, "_blank", "noopener,noreferrer")}
                  disabled={props.disabled}
                >
                  <img src={props.el.croppedDataUrl} alt="cropped" className="block h-auto w-full" />
                </button>
              ) : (
                <div className="px-3 py-6 text-center text-xs text-zinc-500">未生成</div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="ghost"
                type="button"
                disabled={props.disabled || !props.el.croppedDataUrl}
                onClick={() => props.el.croppedDataUrl && void copyImage(props.el.croppedDataUrl)}
              >
                <Copy className="h-4 w-4" />
                复制裁剪图
              </Button>
              <Button
                variant="ghost"
                type="button"
                disabled={props.disabled || !props.el.generatedDataUrl}
                onClick={() => props.el.generatedDataUrl && void copyImage(props.el.generatedDataUrl)}
              >
                <Copy className="h-4 w-4" />
                复制生成图
              </Button>
            </div>
            {props.el.croppedHistory && props.el.croppedHistory.length > 1 ? (
              <div className="mt-2">
                <div className="mb-1 text-xs text-zinc-500">历史（点击切换）</div>
                <div className="flex flex-wrap gap-2">
                  {props.el.croppedHistory.map((u, idx) => {
                    const active = u === props.el.croppedDataUrl;
                    return (
                      <button
                        key={`${idx}`}
                        type="button"
                        className={
                          active
                            ? "h-12 w-12 overflow-hidden rounded-md border border-indigo-500/50 bg-indigo-500/10"
                            : "h-12 w-12 overflow-hidden rounded-md border border-white/10 bg-white/5 hover:bg-white/10"
                        }
                        onClick={() => props.onSelectCropped(u)}
                        disabled={props.disabled}
                        title={active ? "当前" : "点击切换"}
                      >
                        <img src={u} alt="cropped_history" className="block h-full w-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-zinc-200">Figma 填充素材（Fit / 270 比例 / 1024 分辨率）</div>
            <div
              className="overflow-hidden rounded-md border border-white/10"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
                backgroundSize: "18px 18px",
                backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
              }}
            >
              {props.el.figmaFillDataUrl ? (
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => window.open(props.el.figmaFillDataUrl, "_blank", "noopener,noreferrer")}
                  disabled={props.disabled}
                >
                  <img src={props.el.figmaFillDataUrl} alt="figma_fill" className="block h-auto w-full" />
                </button>
              ) : (
                <div className="px-3 py-6 text-center text-xs text-zinc-500">未生成</div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="ghost"
                type="button"
                disabled={props.disabled || !props.el.figmaFillDataUrl}
                onClick={() => props.el.figmaFillDataUrl && void copyImage(props.el.figmaFillDataUrl)}
              >
                <Copy className="h-4 w-4" />
                复制填充图
              </Button>
              {copyHint ? <div className="text-xs text-zinc-400">{copyHint}</div> : null}
            </div>
            {props.el.figmaFillHistory && props.el.figmaFillHistory.length > 1 ? (
              <div className="mt-2">
                <div className="mb-1 text-xs text-zinc-500">历史（点击切换）</div>
                <div className="flex flex-wrap gap-2">
                  {props.el.figmaFillHistory.map((u, idx) => {
                    const active = u === props.el.figmaFillDataUrl;
                    return (
                      <button
                        key={`${idx}`}
                        type="button"
                        className={
                          active
                            ? "h-12 w-12 overflow-hidden rounded-md border border-indigo-500/50 bg-indigo-500/10"
                            : "h-12 w-12 overflow-hidden rounded-md border border-white/10 bg-white/5 hover:bg-white/10"
                        }
                        onClick={() => props.onSelectFigmaFill(u)}
                        disabled={props.disabled}
                        title={active ? "当前" : "点击切换"}
                      >
                        <img src={u} alt="figma_fill_history" className="block h-full w-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
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
          ) : (
            <div className="text-xs text-zinc-500">严格锁定已开启：不提供位置/缩放/旋转调整</div>
          )}

          <div className="grid gap-2">
            <div className="text-xs font-medium text-zinc-200">AI 编辑（图生图）</div>
            <div className="text-xs text-zinc-500">参考图：图 1 = KV；图 2 固定为底图（默认），不会用合成预览或生成结果</div>
            <textarea
              value={props.aiPrompt}
              onChange={(e) => props.setAiPrompt(e.target.value)}
              rows={3}
              disabled={props.disabled}
              className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
              placeholder="例如：把材质改成金属霓虹风，保留形状与透明背景"
            />
            <div className="flex flex-wrap items-center gap-2">
              {!props.batchOnly ? (
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
              ) : (
                <div className="text-xs text-zinc-500">此处不单独生成，请使用顶部“一键生成三元素并合成”</div>
              )}
              {!props.aiEnabled ? <div className="text-xs text-zinc-500">请先在设置页配置 API Key</div> : null}
            </div>
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
