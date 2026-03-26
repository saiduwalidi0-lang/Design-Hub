import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type BannerToolConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
  referenceFieldName: string;
  referenceEncoding: "data_url" | "base64";
  watermark: boolean;
  generationSize: string;
};

type BannerToolConfigStore = {
  config: BannerToolConfig;
  setApiKey: (v: string) => void;
  setEndpoint: (v: string) => void;
  setModel: (v: string) => void;
  setReferenceFieldName: (v: string) => void;
  setReferenceEncoding: (v: BannerToolConfig["referenceEncoding"]) => void;
  setWatermark: (v: boolean) => void;
  setGenerationSize: (v: string) => void;
  clearApiKey: () => void;
};

/** 内置默认 Key（可被 VITE_DEFAULT_API_KEY 覆盖）。前端打包后可见，勿用于高敏感场景。 */
const BUILT_IN_DEFAULT_API_KEY = "b758fd0f-5e5d-4966-a311-a3d290782569";
const DEFAULT_API_KEY =
  (import.meta.env.VITE_DEFAULT_API_KEY ?? "").trim() || BUILT_IN_DEFAULT_API_KEY;
const DEFAULT_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const DEFAULT_MODEL = "doubao-seedream-5-0-260128";
const DEFAULT_REFERENCE_FIELD = "image";
const DEFAULT_REFERENCE_ENCODING: BannerToolConfig["referenceEncoding"] = "data_url";
const DEFAULT_GENERATION_SIZE = "2560x1440";

export const useBannerToolConfigStore = create<BannerToolConfigStore>()(
  persist(
    (set, get) => ({
      config: {
        apiKey: DEFAULT_API_KEY,
        endpoint: DEFAULT_ENDPOINT,
        model: DEFAULT_MODEL,
        referenceFieldName: DEFAULT_REFERENCE_FIELD,
        referenceEncoding: DEFAULT_REFERENCE_ENCODING,
        watermark: true,
        generationSize: DEFAULT_GENERATION_SIZE,
      },
      setApiKey: (v) => set({ config: { ...get().config, apiKey: v } }),
      setEndpoint: (v) => set({ config: { ...get().config, endpoint: v } }),
      setModel: (v) => set({ config: { ...get().config, model: v } }),
      setReferenceFieldName: (v) => set({ config: { ...get().config, referenceFieldName: v } }),
      setReferenceEncoding: (v) => set({ config: { ...get().config, referenceEncoding: v } }),
      setWatermark: (v) => set({ config: { ...get().config, watermark: v } }),
      setGenerationSize: (v) => set({ config: { ...get().config, generationSize: v } }),
      clearApiKey: () => set({ config: { ...get().config, apiKey: "" } }),
    }),
    {
      name: "banner-expand-tool:config",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ config: s.config }),
      merge: (persisted, current) => {
        const p = persisted as { config?: Partial<BannerToolConfig> } | undefined;
        const mergedConfig: BannerToolConfig = {
          ...current.config,
          ...(p?.config ?? {}),
        };

        if (!mergedConfig.apiKey.trim() && DEFAULT_API_KEY) {
          mergedConfig.apiKey = DEFAULT_API_KEY;
        }

        return {
          ...current,
          ...(p ?? {}),
          config: {
            ...mergedConfig,
          },
        };
      },
    }
  )
);

export function isConfigReady(config: BannerToolConfig) {
  return config.apiKey.trim().length > 0 && config.endpoint.trim().length > 0;
}
