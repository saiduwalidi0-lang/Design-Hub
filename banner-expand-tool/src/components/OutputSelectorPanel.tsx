type OutputSelectorPanelProps = {
  outputBanner: boolean;
  setOutputBanner: (v: boolean) => void;
  outputAvatarFrame: boolean;
  setOutputAvatarFrame: (v: boolean) => void;
};

export default function OutputSelectorPanel(props: OutputSelectorPanelProps) {
  const anySelected = props.outputBanner || props.outputAvatarFrame;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">输出类型</div>
        <div className="mt-0.5 text-xs text-zinc-400">可同时勾选 Banner 与头像框</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <label
          className={
            props.outputBanner
              ? "flex cursor-pointer items-center gap-2 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100"
              : "flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200"
          }
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-500"
            checked={props.outputBanner}
            onChange={(e) => props.setOutputBanner(e.target.checked)}
          />
          生成 Banner
        </label>

        <label
          className={
            props.outputAvatarFrame
              ? "flex cursor-pointer items-center gap-2 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100"
              : "flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200"
          }
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-500"
            checked={props.outputAvatarFrame}
            onChange={(e) => props.setOutputAvatarFrame(e.target.checked)}
          />
          生成头像框
        </label>
      </div>

      {!anySelected ? (
        <div className="mt-2 text-xs text-rose-200">请至少勾选一个输出类型</div>
      ) : null}
    </div>
  );
}

