import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { isConfigReady, useBannerToolConfigStore } from "@/store/config";

type PageShellProps = {
  title: string;
  children: React.ReactNode;
};

export default function PageShell(props: PageShellProps) {
  const location = useLocation();
  const nav = useNavigate();
  const config = useBannerToolConfigStore((s) => s.config);
  const ready = isConfigReady(config);

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-50">
      <div className="border-b border-white/10 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              className="text-sm font-semibold tracking-wide"
              onClick={() => nav("/")}
              type="button"
            >
              Banner 扩图工具
            </button>
            <div className="hidden items-center gap-1 sm:flex">
              <Link
                to="/"
                className={cn(
                  "rounded-md px-2 py-1 text-sm transition hover:bg-white/10",
                  location.pathname === "/" && "bg-white/10"
                )}
              >
                制作
              </Link>
              <Link
                to="/settings"
                className={cn(
                  "rounded-md px-2 py-1 text-sm transition hover:bg-white/10",
                  location.pathname === "/settings" && "bg-white/10"
                )}
              >
                设置
              </Link>
            </div>
          </div>

          <button
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition",
              ready
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15"
                : "border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
            )}
            onClick={() => nav("/settings")}
            aria-label="前往设置"
            title={ready ? "API Key 已配置" : "未配置 API Key"}
          >
            <Settings className="h-3.5 w-3.5" />
            {ready ? "API Key 已配置" : "未配置 API Key"}
            <ArrowRight className="h-3.5 w-3.5 opacity-70" />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-zinc-50">{props.title}</h1>
          <div className="mt-1 text-sm text-zinc-400">上传头图，一键扩图生成多尺寸 Banner 并下载</div>
        </div>
        {props.children}
      </div>
    </div>
  );
}
