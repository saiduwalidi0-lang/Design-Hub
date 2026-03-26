import Button from "@/components/Button";
import type { BannerResultItem } from "@/types/bannerTool";
import { parseWxH } from "@/utils/size";

type BannerResultCardsProps = {
  items: BannerResultItem[];
  onDownloadOne: (size: string) => void;
  bannerDownloadMsBySize?: Record<string, number>;
};

export default function BannerResultCards({ items, onDownloadOne, bannerDownloadMsBySize }: BannerResultCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((it) => {
        const wh = parseWxH(it.size);
        const aspectRatio = wh ? `${wh.width} / ${wh.height}` : "3 / 1";
        return (
          <div key={it.size} className="rounded-lg border border-white/10 bg-zinc-950/40 p-2">
            <button
              type="button"
              className="group relative block w-full overflow-hidden rounded-md border border-white/10 bg-zinc-900"
              onClick={() => window.open(it.previewUrl, "_blank", "noopener,noreferrer")}
            >
              <div className="w-full" style={{ aspectRatio }}>
                <img
                  src={it.previewUrl}
                  alt={it.size}
                  className="h-full w-full object-contain object-center transition group-hover:scale-[1.01]"
                />
              </div>
            </button>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-zinc-300">{it.size}</div>
              <Button variant="secondary" size="sm" type="button" onClick={() => onDownloadOne(it.size)}>
                下载
              </Button>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-zinc-400">
              <div>生成：{it.generateMs != null ? `${it.generateMs} ms` : "-"}</div>
              <div>链路参考更新：{it.referenceUpdateMs != null ? `${it.referenceUpdateMs} ms` : "-"}</div>
              <div>下载触发：{bannerDownloadMsBySize?.[it.size] != null ? `${bannerDownloadMsBySize[it.size]} ms` : "-"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
