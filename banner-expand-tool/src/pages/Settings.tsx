import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import PageShell from "@/components/PageShell";
import Button from "@/components/Button";
import TextField from "@/components/TextField";
import { isConfigReady, useBannerToolConfigStore } from "@/store/config";
import { arkGenerateImage } from "@/utils/ark";
import { normalizeBannerGenerationSize } from "@/utils/size";

export default function Settings() {
  const config = useBannerToolConfigStore((s) => s.config);
  const setApiKey = useBannerToolConfigStore((s) => s.setApiKey);
  const setEndpoint = useBannerToolConfigStore((s) => s.setEndpoint);
  const setReferenceFieldName = useBannerToolConfigStore((s) => s.setReferenceFieldName);
  const setReferenceEncoding = useBannerToolConfigStore((s) => s.setReferenceEncoding);
  const setModel = useBannerToolConfigStore((s) => s.setModel);
  const setGenerationSize = useBannerToolConfigStore((s) => s.setGenerationSize);
  const clearApiKey = useBannerToolConfigStore((s) => s.clearApiKey);

  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const ready = useMemo(() => isConfigReady(config), [config]);

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const minPixels = 3686400;
      const size = normalizeBannerGenerationSize(config.generationSize, minPixels);
      await arkGenerateImage({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        model: config.model,
        prompt: "test",
        size,
        stream: false,
        watermark: false,
        sequentialImageGeneration: "disabled",
        responseFormat: "url",
        referenceFieldName: "",
      });
      setTestResult({ ok: true, message: "连接成功" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "连接失败";
      setTestResult({ ok: false, message: msg });
    } finally {
      setTesting(false);
    }
  }

  return (
    <PageShell title="设置">
      <div className="grid gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">API Key</div>
              <div className="mt-0.5 text-xs text-zinc-400">仅保存在本地浏览器，不会写入代码仓库</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const ok = window.confirm("确认清除本地保存的 API Key？");
                  if (ok) clearApiKey();
                }}
                type="button"
              >
                <RotateCcw className="h-4 w-4" />
                清除
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-200">Key</div>
              <div className="flex gap-2">
                <input
                  value={config.apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type={showKey ? "text" : "password"}
                  className="h-10 flex-1 rounded-md border border-white/15 bg-zinc-950 px-3 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
                  placeholder="输入 Bearer Token（不包含 Bearer 前缀）"
                />
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "隐藏" : "显示"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3">
            <div className="text-sm font-semibold">Endpoint</div>
            <div className="mt-0.5 text-xs text-zinc-400">默认指向 Ark 生图接口，可按需替换为自建网关</div>
          </div>
          <TextField
            label="接口地址"
            value={config.endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://ark.cn-beijing.volces.com/api/v3/images/generations"
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3">
            <div className="text-sm font-semibold">高级（可选）</div>
            <div className="mt-0.5 text-xs text-zinc-400">用于兼容不同实现：参考图字段名、参考图格式、模型名</div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="参考图字段名"
              value={config.referenceFieldName}
              onChange={(e) => setReferenceFieldName(e.target.value)}
              helperText="将上传图片传入该字段"
              placeholder="image"
            />
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-200">参考图格式</div>
              <select
                value={config.referenceEncoding}
                onChange={(e) => setReferenceEncoding(e.target.value as "data_url" | "base64")}
                className="h-10 w-full rounded-md border border-white/15 bg-zinc-950 px-3 text-sm text-zinc-50 outline-none transition focus:border-indigo-500/60"
              >
                <option value="data_url">data_url（推荐）</option>
                <option value="base64">base64（无前缀）</option>
              </select>
              <div className="mt-1 text-xs text-zinc-400">若出现 “invalid url specified”，选择 data_url</div>
            </label>
            <TextField
              label="模型"
              value={config.model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="doubao-seedream-5-0-260128"
            />
            <TextField
              label="生成尺寸"
              value={config.generationSize}
              onChange={(e) => setGenerationSize(e.target.value)}
              helperText="用于满足接口最小像素，最终仍导出 3000×800（建议 3840x1024 或 2K）"
              placeholder="3840x1024"
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">连接与校验</div>
              <div className="mt-0.5 text-xs text-zinc-400">发送最小请求校验 Key 是否可用</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={onTest}
                disabled={!ready || testing}
                type="button"
              >
                {testing ? "测试中…" : "测试连接"}
              </Button>
            </div>
          </div>
          {testResult ? (
            <div
              className={
                testResult.ok
                  ? "rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200"
                  : "rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              }
            >
              {testResult.message}
            </div>
          ) : (
            <div className="text-xs text-zinc-500">填写 API Key 与 Endpoint 后即可测试</div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
