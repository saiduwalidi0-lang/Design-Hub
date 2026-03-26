import type { BannerSizePresetRow } from "@/config/bannerSizePresets";

type ParamsPanelProps = {
  prompt: string;
  setPrompt: (v: string) => void;
  selectedSizes: string[];
  toggleSize: (size: string) => void;
  chainConsistency: boolean;
  setChainConsistency: (v: boolean) => void;
  watermark: boolean;
  setWatermark: (v: boolean) => void;
  /** 有展示行时优先用（含比例说明 + 像素下限说明） */
  sizeRows?: BannerSizePresetRow[];
  sizeOptions: string[];
  disabled?: boolean;
};

export default function ParamsPanel(props: ParamsPanelProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">Banner 参数</div>
        <div className="mt-0.5 text-xs text-zinc-400">可多选输出尺寸，一次性生成</div>
      </div>
      <div className="grid gap-3">
        <div className="grid gap-3">
          <div className="text-xs font-medium text-zinc-200">输出尺寸（可多选）</div>
          <div className="flex flex-wrap gap-2">
            {(props.sizeRows?.length
              ? props.sizeRows.map((r) => ({ size: r.size, sub: r.label }))
              : props.sizeOptions.map((s) => ({ size: s, sub: "" }))
            ).map(({ size, sub }) => {
              const checked = props.selectedSizes.includes(size);
              return (
                <label
                  key={size}
                  className={
                    checked
                      ? "flex cursor-pointer items-center gap-2 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100"
                      : "flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200"
                  }
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-indigo-500"
                    checked={checked}
                    onChange={() => props.toggleSize(size)}
                    disabled={props.disabled}
                  />
                  <span className="flex flex-col gap-0.5 leading-tight">
                    <span className="font-medium">{size}</span>
                    {sub ? <span className="text-[10px] font-normal text-zinc-500">{sub} · 像素下限档</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="text-xs text-zinc-500">
            各比例已按「方舟最小总像素」取整到不过分大于下限；生成仍按顺序串行，多选则总耗时叠加
          </div>
        </div>

        <label className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2">
          <div>
            <div className="text-sm font-medium text-zinc-100">链式参考（默认关）</div>
            <div className="text-xs text-zinc-400">
              开启后同组内下一尺寸以上一张结果为参考，画风更一致，但每步多一次参考图更新、总耗时略增；追求速度请保持关闭
            </div>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-500"
            checked={props.chainConsistency}
            onChange={(e) => props.setChainConsistency(e.target.checked)}
            disabled={props.disabled}
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-200">补充描述（可选）</div>
          <textarea
            value={props.prompt}
            onChange={(e) => props.setPrompt(e.target.value)}
            rows={5}
            disabled={props.disabled}
            className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
            placeholder="描述你希望扩图补全出来的背景、风格与氛围"
          />
        </label>

        <label className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2">
          <div>
            <div className="text-sm font-medium text-zinc-100">水印</div>
            <div className="text-xs text-zinc-400">是否让服务端添加水印</div>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-500"
            checked={props.watermark}
            onChange={(e) => props.setWatermark(e.target.checked)}
            disabled={props.disabled}
          />
        </label>
      </div>
    </div>
  );
}
