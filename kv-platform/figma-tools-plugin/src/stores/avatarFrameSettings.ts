import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type AvatarFrameSettingsState = {
  mode: 'mock' | 'http';
  baseUrl: string;
  token: string;
  generatePath: string;
  setMode: (v: 'mock' | 'http') => void;
  setBaseUrl: (v: string) => void;
  setToken: (v: string) => void;
  setGeneratePath: (v: string) => void;
};

export const useAvatarFrameSettings = create<AvatarFrameSettingsState>()(
  persist(
    (set) => ({
      mode: 'http',
      baseUrl: 'http://localhost:3010',
      token: '',
      generatePath: '/api/avatar-frame/generate',
      setMode: (v) => set({ mode: v }),
      setBaseUrl: (v) => set({ baseUrl: v }),
      setToken: (v) => set({ token: v }),
      setGeneratePath: (v) => set({ generatePath: v }),
    }),
    {
      name: 'dtsuite_avatarframe_settings',
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
