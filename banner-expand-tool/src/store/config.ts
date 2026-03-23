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

const DEFAULT_API_KEY = (import.meta.env.VITE_DEFAULT_API_KEY ?? "").trim();
const DEFAULT_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const DEFAULT_MODEL = "doubao-seedream-5-0-260128";
const DEFAULT_REFERENCE_FIELD = "image";
const DEFAULT_REFERENCE_ENCODING: BannerToolConfig["referenceEncoding"] = "data_url";
const DEFAULT_GENERATION_SIZE = "3840x1024";

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
