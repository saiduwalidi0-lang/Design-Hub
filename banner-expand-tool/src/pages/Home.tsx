import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import PageShell from "@/components/PageShell";
import Dropzone from "@/components/Dropzone";
import ParamsPanel from "@/components/ParamsPanel";
import ResultPanel from "@/components/ResultPanel";
import OutputSelectorPanel from "@/components/OutputSelectorPanel";
import AvatarFrameEditorPanel from "@/components/AvatarFrameEditorPanel";
import GeneratePanel from "@/components/GeneratePanel";
import { MIN_GENERATION_PIXELS } from "@/config/generationLimits";
import { BANNER_SIZE_OPTIONS, BANNER_SIZE_PRESET_ROWS } from "@/config/bannerSizePresets";
import { isConfigReady, useBannerToolConfigStore } from "@/store/config";
import { downloadBlob } from "@/utils/download";
import {
  base64ToBlob,
  blobToDataUrl,
  fileToDataUrl,
  ensureDataUrl,
  getImageSizeFromSrc,
  trimTransparentBounds,
  removeNearBlackBackgroundToTransparent,
  resizeImageDataUrlExact,
} from "@/utils/image";
import { AVATAR_FRAME_FIGMA_TARGET_FRAME } from "@/utils/avatarFrameFigmaSpec";
import {
  avatarFrameTrimAlphaThreshold,
  buildFigmaFillsForElementFromTrimmed,
} from "@/utils/avatarFrameLevelSpec";
import { cutoutWithByteArtistAFr } from "@/utils/byteArtistCutout";
import { cutoutWithComfyUiRmbg } from "@/utils/comfyuiRmbgCutout";
import { cutoutWithRmbgLocalServer } from "@/utils/rmbgLocalCutout";
import type { ResultState, UploadState } from "@/types/bannerTool";
import { generateBannerSet } from "@/utils/bannerGenerate";
import { makeBannerFilename } from "@/utils/filenames";
import { useAvatarFrameComposer } from "@/hooks/useAvatarFrameComposer";
import { arkGenerateImage } from "@/utils/ark";
import type { AvatarFrameElement, AvatarFrameElementId } from "@/types/avatarFrameTool";

const DEFAULT_PROMPT =
  "向左扩图成 3000×800 banner，主体内容保持在右侧，左侧保持干净留白或纯背景，不要出现任何新元素/人物/文字；左右过渡自然；去除图中 logo 和标题；整体风格与原图一致，细节真实。";

type HomeProps = {
  /** 从 /avatar-frame 进入时默认展开头像框工作流 */
  initialAvatarFrame?: boolean;
};

export default function Home({ initialAvatarFrame = false }: HomeProps) {
  const nav = useNavigate();
  const config = useBannerToolConfigStore((s) => s.config);
  const setWatermark = useBannerToolConfigStore((s) => s.setWatermark);
  const ready = useMemo(() => isConfigReady(config), [config]);

  const [upload, setUpload] = useState<UploadState>({ status: "empty" });
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [result, setResult] = useState<ResultState>({ status: "idle" });
  const [bannerCostMs, setBannerCostMs] = useState<number | null>(null);
  const [bannerDownloadTotalMs, setBannerDownloadTotalMs] = useState<number | null>(null);
  const [bannerDownloadMsBySize, setBannerDownloadMsBySize] = useState<Record<string, number>>({});
  const [selectedSizes, setSelectedSizes] = useState<string[]>(BANNER_SIZE_OPTIONS);
  const [chainConsistency, setChainConsistency] = useState(false);
  const [outputBanner, setOutputBanner] = useState(!initialAvatarFrame);
  const [outputAvatarFrame, setOutputAvatarFrame] = useState(initialAvatarFrame);
  const avatar = useAvatarFrameComposer();
  const [activeResultTab, setActiveResultTab] = useState<"banner" | "avatar">("banner");

  useEffect(() => {
    return () => {
      if (result.status === "success") {
        for (const it of result.items) {
          if (it.previewUrl.startsWith("blob:")) URL.revokeObjectURL(it.previewUrl);
        }
      }
    };
  }, [result]);

  function toggleSize(size: string) {
    setSelectedSizes((prev) => (prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]));
  }

  async function onFileSelected(file: File | null) {
    if (!file) {
      setUpload({ status: "empty" });
      return;
    }

    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      setResult({ status: "error", message: "文件过大（最大 15MB）" });
      return;
    }

    if (!file.type.startsWith("image/")) {
      setResult({ status: "error", message: "仅支持图片文件" });
      return;
    }

    setResult({ status: "idle" });
    const dataUrl = await fileToDataUrl(file);

    let w: number | undefined;
    let h: number | undefined;
    try {
      const size = await getImageSizeFromSrc(dataUrl);
      w = size.width;
      h = size.height;
    } catch {
      w = undefined;
      h = undefined;
    }

    setUpload({ status: "ready", file, dataUrl, width: w, height: h });
  }

  async function onGenerate() {
    if (upload.status !== "ready") {
      setResult({ status: "error", message: "请先上传头图" });
      return;
    }

    if (!outputBanner && !outputAvatarFrame) {
      setResult({ status: "error", message: "请至少勾选一个输出类型" });
      return;
    }

    setResult((prev) =>
      outputBanner && ready
        ? { status: "loading", total: selectedSizes.length, done: 0, partialItems: [] }
        : prev
    );
    avatar.setResult((prev) => (outputAvatarFrame ? { status: "loading" } : prev));
    setBannerCostMs(null);
    avatar.setCostMs(null);

    const bannerStart = performance.now();
    if (outputBanner) {
      if (!ready) {
        if (!outputAvatarFrame) {
          nav("/settings");
          return;
        }
        // 同时勾了头像框：未配 Banner API 时跳过 Banner，仅合成头像框
      } else {
        if (selectedSizes.length === 0) {
          setResult({ status: "error", message: "请至少勾选一个输出尺寸" });
          return;
        }

        try {
          const items = await generateBannerSet({
            endpoint: config.endpoint,
            apiKey: config.apiKey,
            model: config.model,
            referenceFieldName: config.referenceFieldName,
            referenceEncoding: config.referenceEncoding,
            watermark: config.watermark,
            uploadDataUrl: upload.dataUrl,
            prompt: prompt.trim().length > 0 ? prompt.trim() : DEFAULT_PROMPT,
            selectedSizes,
            chainConsistency,
            onProgress: ({ total, done, currentSize }) => {
              setResult((prev) => ({
                status: "loading",
                total,
                done,
                currentSize,
                partialItems: prev.status === "loading" ? prev.partialItems : [],
              }));
            },
            onItemComplete: (doneItems) => {
              setResult((prev) =>
                prev.status === "loading"
                  ? { ...prev, partialItems: doneItems, done: doneItems.length }
                  : prev
              );
            },
          });
          setResult({ status: "success", items });
          setBannerCostMs(Math.round(performance.now() - bannerStart));
          setBannerDownloadTotalMs(null);
          setBannerDownloadMsBySize({});
        } catch (e) {
          const msg = e instanceof Error ? e.message : "生成失败";
          setResult((prev) => {
            if (prev.status === "loading" && prev.partialItems?.length) {
              for (const it of prev.partialItems) {
                if (it.previewUrl.startsWith("blob:")) URL.revokeObjectURL(it.previewUrl);
              }
            }
            return { status: "error", message: msg };
          });
          setBannerCostMs(Math.round(performance.now() - bannerStart));
        }
      }
    }

    if (outputAvatarFrame) await avatar.generate();
  }

  async function onAiEditAvatarElement(id: AvatarFrameElementId, instruction: string) {
    if (!ready) {
      nav("/settings");
      throw new Error("未配置 API Key");
    }
    if (upload.status !== "ready") throw new Error("请先上传 KV（图 1）");
    const el = avatar.elements.find((e) => e.id === id);
    if (!el?.dataUrl) throw new Error("默认素材未加载");
    if (String(el.dataUrl).startsWith("data:")) throw new Error("默认素材应来自文件夹图片，不应为 dataUrl");

    let w = el.naturalWidth;
    let h = el.naturalHeight;
    if (!w || !h) {
      const s = await getImageSizeFromSrc(el.dataUrl);
      w = s.width;
      h = s.height;
    }
    if (!w || !h) throw new Error("无法读取图片尺寸");

    const baseRequestW = 1024;
    const baseRequestH = Math.max(1, Math.round((baseRequestW * h) / Math.max(1, w)));
    const basePixels = baseRequestW * baseRequestH;
    const scale = basePixels >= MIN_GENERATION_PIXELS ? 1 : Math.sqrt(MIN_GENERATION_PIXELS / Math.max(1, basePixels));

    const align = (n: number) => Math.max(64, Math.ceil(n / 64) * 64);
    const requestW = align(baseRequestW * scale);
    const requestH = align(baseRequestH * scale);
    const requestSize = `${requestW}x${requestH}`;

    const promptText = instruction;
    const elementDataUrl = await ensureDataUrl(el.dataUrl);

    let res: Awaited<ReturnType<typeof arkGenerateImage>>;
    try {
      res = await arkGenerateImage({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        model: config.model,
        prompt: promptText,
        size: requestSize,
        stream: false,
        watermark: false,
        sequentialImageGeneration: "disabled",
        responseFormat: "b64_json",
        referenceFieldName: "image",
        referenceEncoding: config.referenceEncoding,
        referenceImageDataUrl: [upload.dataUrl, elementDataUrl],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const sizeIssue = /`?size`?|pixels|\u50cf\u7d20|\u5c3a\u5bf8/i.test(msg);
      if (!sizeIssue) throw e;

      const factor = Math.sqrt(MIN_GENERATION_PIXELS / Math.max(1, w * h));
      const scaleUp = factor > 1 ? factor : 1;
      const fallbackW = align(w * scaleUp);
      const fallbackH = align(h * scaleUp);
      res = await arkGenerateImage({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        model: config.model,
        prompt: promptText,
        size: `${fallbackW}x${fallbackH}`,
        stream: false,
        watermark: false,
        sequentialImageGeneration: "disabled",
        responseFormat: "b64_json",
        referenceFieldName: "image",
        referenceEncoding: config.referenceEncoding,
        referenceImageDataUrl: [upload.dataUrl, elementDataUrl],
      });
    }

    if (!res.b64Json) throw new Error("未获取到图生图结果");

    const blob = base64ToBlob(res.b64Json);
    const rawDataUrl = await blobToDataUrl(blob);
    const resizedDataUrl = await resizeImageDataUrlExact(rawDataUrl, w, h);
    const dataUrl = await (async () => {
      if (!avatar.autoCutout) return resizedDataUrl;
      if (avatar.cutoutMethod === "rmbgLocal") {
        return await cutoutWithRmbgLocalServer(resizedDataUrl);
      }
      if (avatar.cutoutMethod === "comfyuiRmbg") {
        return await cutoutWithComfyUiRmbg(resizedDataUrl, {
          model: avatar.comfyuiModel,
          processRes: avatar.comfyuiProcessRes,
        });
      }
      if (avatar.cutoutMethod === "byteArtist") {
        return await cutoutWithByteArtistAFr(resizedDataUrl, {
          host: "https://effect.bytedance.net",
          apiPath: "/media/api/pic/afr",
          appKey: avatar.saliencyAppKey,
          appSecret: avatar.saliencyAppSecret,
          bizTags: "tt-gamelive",
          algorithms: "image_clip",
        });
      }
      return await removeNearBlackBackgroundToTransparent(resizedDataUrl, avatar.cutoutThreshold);
    })();

    const trimmed = await trimTransparentBounds(dataUrl, avatarFrameTrimAlphaThreshold(id));
    const [figmaFillByLevel, figmaFillByLevelViewer] = await Promise.all([
      buildFigmaFillsForElementFromTrimmed(trimmed.dataUrl, id, AVATAR_FRAME_FIGMA_TARGET_FRAME.width, {
        layout: "anchor",
      }),
      buildFigmaFillsForElementFromTrimmed(trimmed.dataUrl, id, AVATAR_FRAME_FIGMA_TARGET_FRAME.width, {
        layout: "viewer",
      }),
    ]);
    const figmaFillL = figmaFillByLevel.L;

    avatar.setElements((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              generatedDataUrl: dataUrl,
              generatedHistory: [dataUrl, ...(e.generatedHistory ?? [])].slice(0, 12),
              croppedDataUrl: trimmed.dataUrl,
              croppedHistory: [trimmed.dataUrl, ...(e.croppedHistory ?? [])].slice(0, 12),
              figmaFillDataUrl: figmaFillL ?? e.figmaFillDataUrl,
              figmaFillByLevel: { ...(e.figmaFillByLevel ?? {}), ...figmaFillByLevel },
              figmaFillByLevelViewer: { ...(e.figmaFillByLevelViewer ?? {}), ...figmaFillByLevelViewer },
              figmaFillHistory:
                figmaFillL != null
                  ? [figmaFillL, ...(e.figmaFillHistory ?? [])].slice(0, 12)
                  : e.figmaFillHistory,
              naturalWidth: w,
              naturalHeight: h,
              visible: true,
            }
          : e
      )
    );
  }

  /**
   * 不调模型：用各槽当前 `dataUrl`（默认素材即可）裁透明边后，按主播/观众槽位生成 Figma 填充并刷新下方预览。
   */
  async function quickFigmaSlotPreviewFromAssets(): Promise<{ ok: true } | { ok: false; message: string }> {
    const targets = avatar.elements.filter((e) => Boolean(e.dataUrl?.trim()));
    if (targets.length === 0) {
      return { ok: false, message: "没有已加载的底图，请先选择默认套或确认素材路径" };
    }
    try {
      const patchById = new Map<
        AvatarFrameElementId,
        Pick<AvatarFrameElement, "figmaFillDataUrl" | "figmaFillByLevel" | "figmaFillByLevelViewer">
      >();

      await Promise.all(
        targets.map(async (el) => {
          const base = await ensureDataUrl(el.dataUrl!);
          const trimmedDataUrl = el.croppedDataUrl
            ? el.croppedDataUrl
            : (await trimTransparentBounds(base, avatarFrameTrimAlphaThreshold(el.id))).dataUrl;
          const [figmaFillByLevel, figmaFillByLevelViewer] = await Promise.all([
            buildFigmaFillsForElementFromTrimmed(trimmedDataUrl, el.id, AVATAR_FRAME_FIGMA_TARGET_FRAME.width, {
              layout: "anchor",
            }),
            buildFigmaFillsForElementFromTrimmed(trimmedDataUrl, el.id, AVATAR_FRAME_FIGMA_TARGET_FRAME.width, {
              layout: "viewer",
            }),
          ]);
          const figmaFillL = figmaFillByLevel.L;
          patchById.set(el.id, {
            figmaFillDataUrl: figmaFillL ?? el.figmaFillDataUrl,
            figmaFillByLevel: { ...(el.figmaFillByLevel ?? {}), ...figmaFillByLevel },
            figmaFillByLevelViewer: { ...(el.figmaFillByLevelViewer ?? {}), ...figmaFillByLevelViewer },
          });
        })
      );

      avatar.setElements((prev) =>
        prev.map((e) => {
          const p = patchById.get(e.id);
          return p ? { ...e, ...p } : e;
        })
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  function bannerItemsForDownload() {
    if (result.status === "success") return result.items;
    if (result.status === "loading" && result.partialItems?.length) return result.partialItems;
    return [];
  }

  function onDownloadOne(size: string) {
    const list = bannerItemsForDownload();
    const item = list.find((it) => it.size === size);
    if (!item) return;
    const start = performance.now();
    if (item.blob) {
      downloadBlob(item.blob, makeBannerFilename(item.size));
      setBannerDownloadMsBySize((prev) => ({ ...prev, [size]: Math.round(performance.now() - start) }));
      return;
    }
    if (item.remoteUrl) {
      window.open(item.remoteUrl, "_blank", "noopener,noreferrer");
      setBannerDownloadMsBySize((prev) => ({ ...prev, [size]: Math.round(performance.now() - start) }));
    }
  }

  function onDownloadAvatar(kind: "frame" | "composite") {
    avatar.download(kind);
  }

  async function onDownloadAll() {
    const list = bannerItemsForDownload();
    if (list.length === 0) return;
    const startAll = performance.now();
    for (const it of list) {
      const start = performance.now();
      if (it.blob) downloadBlob(it.blob, makeBannerFilename(it.size));
      else if (it.remoteUrl) window.open(it.remoteUrl, "_blank", "noopener,noreferrer");
      setBannerDownloadMsBySize((prev) => ({ ...prev, [it.size]: Math.round(performance.now() - start) }));
      await new Promise((r) => setTimeout(r, 350));
    }
    setBannerDownloadTotalMs(Math.round(performance.now() - startAll));
  }

  const avatarOnlyLayout = outputAvatarFrame && !outputBanner;

  return (
    <PageShell title="制作">
      <div className={cn("grid xl:grid-cols-[minmax(0,1fr)_420px]", avatarOnlyLayout ? "gap-3" : "gap-4")}>
        <div className={cn("min-w-0 grid", avatarOnlyLayout ? "gap-3" : "gap-4")}>
          <div
            className={cn(
              "rounded-xl border border-white/10 bg-white/5",
              avatarOnlyLayout ? "p-3" : "p-4"
            )}
          >
            <div className={cn("flex items-center justify-between", avatarOnlyLayout ? "mb-2" : "mb-3")}>
              <div>
                <div className="text-sm font-semibold">上传头图</div>
                <div className="mt-0.5 text-xs text-zinc-400">
                  {avatarOnlyLayout ? "KV 参考图，用于图生图" : "支持拖拽或点击选择"}
                </div>
              </div>
              {upload.status === "ready" ? (
                <div className="text-xs text-zinc-400">
                  {upload.width && upload.height ? `${upload.width}×${upload.height}` : ""}
                </div>
              ) : null}
            </div>
            <Dropzone
              onFileSelected={onFileSelected}
              disabled={result.status === "loading"}
              previewDataUrl={upload.status === "ready" ? upload.dataUrl : undefined}
              variant={avatarOnlyLayout ? "compact" : "default"}
            />
            {upload.status === "ready" ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                <div className="truncate">{upload.file.name}</div>
                <div>{Math.max(1, Math.round(upload.file.size / 1024))} KB</div>
              </div>
            ) : null}
          </div>
          <OutputSelectorPanel
            outputBanner={outputBanner}
            setOutputBanner={setOutputBanner}
            outputAvatarFrame={outputAvatarFrame}
            setOutputAvatarFrame={setOutputAvatarFrame}
          />
          {outputBanner ? (
            <ParamsPanel
              prompt={prompt}
              setPrompt={setPrompt}
              sizeRows={BANNER_SIZE_PRESET_ROWS}
              sizeOptions={BANNER_SIZE_OPTIONS}
              selectedSizes={selectedSizes}
              toggleSize={toggleSize}
              chainConsistency={chainConsistency}
              setChainConsistency={setChainConsistency}
              watermark={config.watermark}
              setWatermark={setWatermark}
              disabled={false}
            />
          ) : null}
          {outputAvatarFrame ? (
            <AvatarFrameEditorPanel
              defaultGroups={avatar.defaultGroups}
              selectedDefaultSuiteId={avatar.selectedDefaultSuiteId}
              selectedDefaultGroupKind={avatar.selectedDefaultGroupKind}
              onSelectDefaultSuite={avatar.applyDefaultSuite}
              elements={avatar.elements}
              order={avatar.order}
              setOrder={avatar.setOrder}
              setElements={avatar.setElements}
              placeholderAvatarDataUrl={avatar.placeholderAvatarDataUrl}
              setPlaceholderAvatarDataUrl={avatar.setPlaceholderAvatarDataUrl}
              resetPlaceholderAvatar={avatar.resetPlaceholderAvatar}
              aiEnabled={ready}
              onAiEditElement={onAiEditAvatarElement}
              autoCutout={avatar.autoCutout}
              setAutoCutout={avatar.setAutoCutout}
              cutoutMethod={avatar.cutoutMethod}
              setCutoutMethod={avatar.setCutoutMethod}
              cutoutThreshold={avatar.cutoutThreshold}
              setCutoutThreshold={avatar.setCutoutThreshold}

              saliencyEndpoint={avatar.saliencyEndpoint}
              setSaliencyEndpoint={avatar.setSaliencyEndpoint}
              saliencyAppKey={avatar.saliencyAppKey}
              setSaliencyAppKey={avatar.setSaliencyAppKey}
              saliencyAppSecret={avatar.saliencyAppSecret}
              setSaliencyAppSecret={avatar.setSaliencyAppSecret}
              saliencyOnlyMask={avatar.saliencyOnlyMask}
              setSaliencyOnlyMask={avatar.setSaliencyOnlyMask}
              saliencyRefineMask={avatar.saliencyRefineMask}
              setSaliencyRefineMask={avatar.setSaliencyRefineMask}

              comfyuiModel={avatar.comfyuiModel}
              setComfyuiModel={avatar.setComfyuiModel}
              comfyuiProcessRes={avatar.comfyuiProcessRes}
              setComfyuiProcessRes={avatar.setComfyuiProcessRes}

              onComposeAvatarFrame={avatar.generate}
              onShowAvatarResult={() => setActiveResultTab("avatar")}
              onQuickFigmaSlotPreview={quickFigmaSlotPreviewFromAssets}

              disabled={false}
            />
          ) : null}
          <GeneratePanel
            readyForBanner={ready}
            hasUpload={upload.status === "ready"}
            outputBanner={outputBanner}
            outputAvatarFrame={outputAvatarFrame}
            canGenerateBanner={selectedSizes.length > 0}
            canGenerateAvatarFrame={avatar.canGenerate}
            isGenerating={result.status === "loading" || avatar.result.status === "loading"}
            errorText={
              result.status === "error" ? result.message : avatar.result.status === "error" ? avatar.result.message : undefined
            }
            bannerCostMs={bannerCostMs}
            avatarCostMs={avatar.costMs}
            onGenerate={onGenerate}
            onOpenSettings={() => nav("/settings")}
          />
        </div>
        <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <ResultPanel
            result={result}
            avatarResult={avatar.result}
            activeTab={activeResultTab}
            setActiveTab={setActiveResultTab}
            onDownloadOne={onDownloadOne}
            onDownloadAll={onDownloadAll}
            onDownloadAvatar={onDownloadAvatar}
            bannerGenerateTotalMs={bannerCostMs}
            bannerDownloadTotalMs={bannerDownloadTotalMs}
            bannerDownloadMsBySize={bannerDownloadMsBySize}
          />
        </div>
      </div>
    </PageShell>
  );
}
