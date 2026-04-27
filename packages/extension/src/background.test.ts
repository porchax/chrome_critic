import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleIconClick } from './background';

describe('handleIconClick', () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      windows: { create: vi.fn().mockResolvedValue({ id: 1 }) },
      runtime: { getURL: (p: string) => `chrome-extension://abc/${p}` },
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  it('opens popup window with tabId in url', async () => {
    await handleIconClick({ id: 42, url: 'https://x/a' } as chrome.tabs.Tab);
    const call = (chrome.windows.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call.url).toContain('src/sidepanel/index.html?tabId=42');
    expect(call.type).toBe('popup');
  });

  it('ignores tabs without id', async () => {
    await handleIconClick({} as chrome.tabs.Tab);
    expect(chrome.windows.create).not.toHaveBeenCalled();
  });
});
