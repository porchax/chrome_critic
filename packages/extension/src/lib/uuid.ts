const KEY = 'criticus_uuid';

export async function getOrCreateUuid(): Promise<string> {
  const stored = await chrome.storage.sync.get(KEY);
  const existing = stored[KEY] as string | undefined;
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  await chrome.storage.sync.set({ [KEY]: fresh });
  return fresh;
}
