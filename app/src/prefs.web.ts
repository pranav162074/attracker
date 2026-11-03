const key = (name: string) => `attracker.pref.${name}`;

export const prefs = {
  read: async (name: string): Promise<string | null> => {
    try {
      return globalThis.localStorage?.getItem(key(name)) ?? null;
    } catch {
      return null;
    }
  },
  save: async (name: string, value: string) => {
    try {
      globalThis.localStorage?.setItem(key(name), value);
    } catch {
      return;
    }
  },
};
