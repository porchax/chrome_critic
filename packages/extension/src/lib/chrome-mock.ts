type Storage = Record<string, unknown>;

export function makeChromeMock(initial: Storage = {}) {
  const store: Storage = { ...initial };
  return {
    storage: {
      sync: {
        get(keys: string | string[]) {
          const arr = Array.isArray(keys) ? keys : [keys];
          const out: Storage = {};
          for (const k of arr) {
            if (k in store) out[k] = store[k];
          }
          return Promise.resolve(out);
        },
        set(values: Storage) {
          Object.assign(store, values);
          return Promise.resolve();
        },
      },
    },
    _store: store,
  };
}
