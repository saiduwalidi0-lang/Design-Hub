import { Loader2, Settings, Sparkles } from "lucide-react";
import Button from "@/components/Button";

type GeneratePanelProps = {
  readyForBanner: boolean;
  hasUpload: boolean;
  outputBanner: boolean;
  outputAvatarFrame: boolean;
  canGenerateBanner: boolean;
  canGenerateAvatarFrame: boolean;
  isGenerating: boolean;
  errorText?: string;
  bannerCostMs?: number | null;
  avatarCostMs?: number | null;
  onGenerate: () => void;
  onOpenSettings: () => void;
};

export default function GeneratePanel(props: GeneratePanelProps) {
  const canSubmit =
    !props.isGenerating &&
    props.hasUpload &&
    (props.outputBanner || props.outputAvatarFrame) &&
    (!props.outputBanner || props.readyForBanner) &&
    (!props.outputBanner || props.canGenerateBanner) &&
    (!props.outputAvatarFrame || props.canGenerateAvatarFrame);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">生成</div>
        <div className="mt-0.5 text-xs text-zinc-400">当前仅实现头像框的本地合成占位，不接入真实 AI 抠图</div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={props.onGenerate} disabled={!canSubmit} type="button" className="flex-1">
            {props.isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                生成中…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                开始生成
              </>
            )}
          </Button>
          <Button variant="secondary" onClick={props.onOpenSettings} type="button" className="shrink-0">
            <Settings className="h-4 w-4" />
            设置
          </Button>
        </div>

        {!props.hasUpload ? <div className="text-xs text-zinc-400">请先上传 KV</div> : null}

        {props.outputBanner && !props.readyForBanner ? (
          <div className="text-xs text-zinc-400">未配置 API Key：如需生成 Banner，请先前往设置页完成配置</div>
        ) : null}

        {props.outputAvatarFrame && !props.canGenerateAvatarFrame ? (
          <div className="text-xs text-zinc-400">头像框主体（元素 1）为必填：请先上传素材</div>
        ) : null}

        {props.errorText ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {props.errorText}
          </div>
        ) : null}

        {props.bannerCostMs != null || props.avatarCostMs != null ? (
          <div className="text-xs text-zinc-500">
            {props.bannerCostMs != null ? `Banner 耗时：${Math.max(0, props.bannerCostMs)}ms` : ""}
            {props.bannerCostMs != null && props.avatarCostMs != null ? " · " : ""}
            {props.avatarCostMs != null ? `头像框耗时：${Math.max(0, props.avatarCostMs)}ms` : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}

