import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleIconClick } from './background';

describe('handleIconClick', () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      sidePanel: { open: vi.fn().mockResolvedValue(undefined) },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
      runtime: { sendMessage: vi.fn() },
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  it('opens side panel and broadcasts analyze-tab', async () => {
    await handleIconClick({ id: 42, url: 'https://x/a' } as chrome.tabs.Tab);
    expect((chrome.sidePanel.open as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toEqual({
      tabId: 42,
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'analyze-tab', tabId: 42 });
  });

  it('ignores tabs without id', async () => {
    await handleIconClick({} as chrome.tabs.Tab);
    expect(chrome.sidePanel.open).not.toHaveBeenCalled();
  });
});
