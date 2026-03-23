type ParamsPanelProps = {
  prompt: string;
  setPrompt: (v: string) => void;
  selectedSizes: string[];
  toggleSize: (size: string) => void;
  chainConsistency: boolean;
  setChainConsistency: (v: boolean) => void;
  watermark: boolean;
  setWatermark: (v: boolean) => void;
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
            {props.sizeOptions.map((s) => {
              const checked = props.selectedSizes.includes(s);
              return (
                <label
                  key={s}
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
                    onChange={() => props.toggleSize(s)}
                    disabled={props.disabled}
                  />
                  {s}
                </label>
              );
            })}
          </div>
          <div className="text-xs text-zinc-500">建议全选；生成会按顺序串行执行</div>
        </div>

        <label className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2">
          <div>
            <div className="text-sm font-medium text-zinc-100">保持一致（链式参考图）</div>
            <div className="text-xs text-zinc-400">每个尺寸用上一个结果作为参考图，尽量统一画面</div>
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
