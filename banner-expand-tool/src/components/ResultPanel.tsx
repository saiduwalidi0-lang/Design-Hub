import { Download, ImageIcon, Layers, UploadCloud } from "lucide-react";
import Button from "@/components/Button";
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
};

export default function ResultPanel({
  result,
  avatarResult,
  activeTab,
  setActiveTab,
  onDownloadOne,
  onDownloadAll,
  onDownloadAvatar,
}: ResultPanelProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">结果预览</div>
          <div className="mt-0.5 text-xs text-zinc-400">点击图片可在新窗口打开</div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "banner" ? (
            <Button
              variant="primary"
              onClick={onDownloadAll}
              disabled={result.status !== "success" || (result.status === "success" && result.items.length === 0)}
              type="button"
            >
              <Download className="h-4 w-4" />
              下载全部
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => onDownloadAvatar("frame")}
              disabled={avatarResult.status !== "success"}
              type="button"
            >
              <Download className="h-4 w-4" />
              下载透明 PNG
            </Button>
          )}
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
          <div className="text-xs text-zinc-500">可一次性输出多个尺寸</div>
        </div>
        ) : result.status === "loading" ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-white/10 bg-zinc-950/40 text-center">
            <UploadCloud className="h-6 w-6 text-zinc-300" />
            <div className="text-sm text-zinc-200">正在生成{result.currentSize ? `（${result.currentSize}）` : ""}…</div>
            <div className="text-xs text-zinc-500">
              {Math.min(result.total, Math.max(0, result.done))}/{Math.max(1, result.total)}
            </div>
          </div>
        ) : result.status === "error" ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 text-center">
            <div className="text-sm font-medium text-red-200">生成失败</div>
            <div className="max-w-[560px] text-xs text-red-200/80">{result.message}</div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {result.items.map((it) => (
                <div key={it.size} className="rounded-lg border border-white/10 bg-zinc-950/40 p-2">
                  <button
                    type="button"
                    className="group relative block w-full overflow-hidden rounded-md border border-white/10 bg-zinc-950"
                    onClick={() => window.open(it.previewUrl, "_blank", "noopener,noreferrer")}
                  >
                    <div className="aspect-[3/1] w-full">
                      <img src={it.previewUrl} alt={it.size} className="h-full w-full object-cover transition group-hover:scale-[1.01]" />
                    </div>
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-xs text-zinc-300">{it.size}</div>
                    <Button variant="secondary" size="sm" type="button" onClick={() => onDownloadOne(it.size)}>
                      下载
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-zinc-500">若浏览器拦截批量下载，请允许此站点进行多个下载</div>
          </div>
        )
      ) : avatarResult.status === "idle" ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-zinc-950/40 text-center">
          <Layers className="h-6 w-6 text-zinc-400" />
          <div className="text-sm text-zinc-300">上传三元素并点击“开始生成”</div>
          <div className="text-xs text-zinc-500">当前为本地合成占位（无真实抠图）</div>
        </div>
      ) : avatarResult.status === "loading" ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-white/10 bg-zinc-950/40 text-center">
          <UploadCloud className="h-6 w-6 text-zinc-300" />
          <div className="text-sm text-zinc-200">正在合成头像框…</div>
          <div className="text-xs text-zinc-500">本地合成中</div>
        </div>
      ) : avatarResult.status === "error" ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 text-center">
          <div className="text-sm font-medium text-red-200">合成失败</div>
          <div className="max-w-[560px] text-xs text-red-200/80">{avatarResult.message}</div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-zinc-950/40 p-2">
              <button
                type="button"
                className="group relative block w-full overflow-hidden rounded-md border border-white/10"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
                  backgroundSize: "24px 24px",
                  backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
                }}
                onClick={() => window.open(avatarResult.framePngDataUrl, "_blank", "noopener,noreferrer")}
              >
                <div className="aspect-square w-full">
                  <img
                    src={avatarResult.framePngDataUrl}
                    alt="avatar_frame_transparent"
                    className="h-full w-full object-contain transition group-hover:scale-[1.01]"
                  />
                </div>
              </button>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-300">透明 PNG（仅框）</div>
                <Button variant="secondary" size="sm" type="button" onClick={() => onDownloadAvatar("frame")}
                >
                  下载
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-zinc-950/40 p-2">
              <button
                type="button"
                className="group relative block w-full overflow-hidden rounded-md border border-white/10 bg-zinc-950"
                onClick={() => window.open(avatarResult.compositePngDataUrl, "_blank", "noopener,noreferrer")}
              >
                <div className="aspect-square w-full">
                  <img
                    src={avatarResult.compositePngDataUrl}
                    alt="avatar_frame_composite"
                    className="h-full w-full object-contain transition group-hover:scale-[1.01]"
                  />
                </div>
              </button>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-300">占位合并预览图</div>
                <Button variant="secondary" size="sm" type="button" onClick={() => onDownloadAvatar("composite")}
                >
                  下载
                </Button>
              </div>
            </div>
          </div>

          <div className="text-xs text-zinc-500">透明 PNG 用于上脸合成；占位图用于快速验收效果</div>
        </div>
      )}
    </div>
  );
}
