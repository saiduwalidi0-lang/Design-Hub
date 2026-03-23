import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type CmsSettingsState = {
  baseUrl: string;
  token: string;
  setBaseUrl: (v: string) => void;
  setToken: (v: string) => void;
};

export const useCmsSettings = create<CmsSettingsState>()(
  persist(
    (set) => ({
      baseUrl: 'http://localhost:3001',
      token: '',
      setBaseUrl: (v) => set({ baseUrl: v }),
      setToken: (v) => set({ token: v }),
    }),
    {
      name: 'dtsuite_cms_settings',
      storage: createJSONStorage(() => {
        const memory = new Map<string, string>();
        return {
          getItem: (name: string) => {
            try {
              if (typeof window !== 'undefined' && window.localStorage) {
                return window.localStorage.getItem(name);
              }
            } catch (e) {
              void e;
            }
            return memory.get(name) ?? null;
          },
          setItem: (name: string, value: string) => {
            try {
              if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(name, value);
                return;
              }
            } catch (e) {
              void e;
            }
            memory.set(name, value);
          },
          removeItem: (name: string) => {
            try {
              if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(name);
                return;
              }
            } catch (e) {
              void e;
            }
            memory.delete(name);
          },
        };
      }),
    }
  )
);
