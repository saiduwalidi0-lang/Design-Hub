import { Download, ImageIcon, Layers, UploadCloud } from "lucide-react";
import Button from "@/components/Button";
import BannerResultCards from "@/components/BannerResultCards";
import type { ResultState } from "@/types/bannerTool";
import type { AvatarFrameResultState } from "@/types/avatarFrameTool";

type ResultPanelProps = {
  result: ResultState;
  avatarResult: AvatarFrameResultState;
  activeTab: "banner" | "avatar";
  setActiveTab: (t: "banner" | "avatar") => void;
  onDownloadOne: (size: string) => void;
  onDownloadAll: () => void;
  onDownloadAvatar: (kind: "frame" | "composite") => void;
  bannerGenerateTotalMs?: number | null;
  bannerDownloadTotalMs?: number | null;
  bannerDownloadMsBySize?: Record<string, number>;
};

export default function ResultPanel({
  result,
  avatarResult,
  activeTab,
  setActiveTab,
  onDownloadOne,
  onDownloadAll,
  onDownloadAvatar,
  bannerGenerateTotalMs,
  bannerDownloadTotalMs,
  bannerDownloadMsBySize,
}: ResultPanelProps) {
  const canDownloadAllBanner =
    (result.status === "success" && result.items.length > 0) ||
    (result.status === "loading" && (result.partialItems?.length ?? 0) > 0);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">结果预览</div>
          <div className="mt-0.5 text-xs text-zinc-400">
            {activeTab === "banner" ? "点击图片可在新窗口打开" : "头像框仅提供下载，不展示大图预览"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "banner" ? (
            <Button
              variant="primary"
              onClick={onDownloadAll}
              disabled={!canDownloadAllBanner}
              type="button"
            >
              <Download className="h-4 w-4" />
              下载全部
            </Button>
          ) : avatarResult.status === "success" ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="primary" type="button" onClick={() => onDownloadAvatar("frame")}>
                <Download className="h-4 w-4" />
                透明 PNG
              </Button>
              <Button variant="secondary" type="button" onClick={() => onDownloadAvatar("composite")}>
                <Download className="h-4 w-4" />
                占位合并
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("banner")}
          className={
            activeTab === "banner"
              ? "rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-100"
              : "rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
          }
        >
          Banner
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("avatar")}
          className={
            activeTab === "avatar"
              ? "rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-100"
              : "rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
          }
        >
          头像框
        </button>
      </div>

      {activeTab === "banner" ? (
        result.status === "idle" ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-zinc-950/40 text-center">
          <ImageIcon className="h-6 w-6 text-zinc-400" />
          <div className="text-sm text-zinc-300">上传头图并点击“生成 Banner”</div>
          <div className="text-xs text-zinc-500">多尺寸会逐项生成，无需等全部完成即可预览已出图</div>
        </div>
        ) : result.status === "loading" ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2.5">
              <UploadCloud className="h-5 w-5 shrink-0 text-zinc-300" />
              <div className="min-w-0 flex-1 text-left">
                <div className="text-sm text-zinc-200">
                  正在生成{result.currentSize ? ` ${result.currentSize}` : ""}…
                </div>
                <div className="text-xs text-zinc-500">
                  {Math.min(result.total, Math.max(0, result.done))}/{Math.max(1, result.total)} · 已完成会先出现在下方
                </div>
              </div>
            </div>
            {result.partialItems && result.partialItems.length > 0 ? (
              <BannerResultCards
                items={result.partialItems}
                onDownloadOne={onDownloadOne}
                bannerDownloadMsBySize={bannerDownloadMsBySize}
              />
            ) : (
              <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-zinc-950/30 px-4 text-center text-xs text-zinc-500">
                首张出图后会自动显示在这里，可先点开预览或下载
              </div>
            )}
          </div>
        ) : result.status === "error" ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 text-center">
            <div className="text-sm font-medium text-red-200">生成失败</div>
            <div className="max-w-[560px] text-xs text-red-200/80">{result.message}</div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="rounded-md border border-white/10 bg-black/20 p-2 text-xs text-zinc-300">
              <div>生成总耗时：{bannerGenerateTotalMs != null ? `${bannerGenerateTotalMs} ms` : "-"}</div>
              <div>批量下载总耗时：{bannerDownloadTotalMs != null ? `${bannerDownloadTotalMs} ms` : "-"}</div>
            </div>
            <BannerResultCards
              items={result.items}
              onDownloadOne={onDownloadOne}
              bannerDownloadMsBySize={bannerDownloadMsBySize}
            />
            <div className="text-xs text-zinc-500">若浏览器拦截批量下载，请允许此站点进行多个下载</div>
          </div>
        )
      ) : avatarResult.status === "idle" ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 bg-zinc-950/40 px-4 py-6 text-center">
          <Layers className="h-5 w-5 text-zinc-400" />
          <div className="text-sm text-zinc-300">上传三元素并点击「开始生成」</div>
          <div className="text-xs text-zinc-500">合成完成后在此用按钮下载，不再展示大图预览以节省空间</div>
        </div>
      ) : avatarResult.status === "loading" ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-zinc-950/40 px-4 py-8 text-center">
          <UploadCloud className="h-5 w-5 text-zinc-300" />
          <div className="text-sm text-zinc-200">正在合成头像框…</div>
        </div>
      ) : avatarResult.status === "error" ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-8 text-center">
          <div className="text-sm font-medium text-red-200">合成失败</div>
          <div className="max-w-[560px] text-xs text-red-200/80">{avatarResult.message}</div>
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-3 text-xs text-zinc-400">
          已合成。使用右上角按钮下载：<span className="text-zinc-300">透明 PNG</span> 用于上脸；
          <span className="text-zinc-300">占位合并</span> 用于快速验收（无大图预览）。
        </div>
      )}
    </div>
  );
}
