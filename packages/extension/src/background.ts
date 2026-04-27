async function openPanelWindow(tabId: number): Promise<void> {
  const url = chrome.runtime.getURL('src/sidepanel/index.html') + `?tabId=${tabId}`;
  await chrome.windows.create({
    url,
    type: 'popup',
    width: 460,
    height: 720,
    focused: true,
  });
}

export async function handleIconClick(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) return;
  if (chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
      chrome.runtime.sendMessage({ type: 'analyze-tab', tabId: tab.id });
      return;
    } catch {
      // fall through to window fallback
    }
  }
  await openPanelWindow(tab.id);
}

if (typeof chrome !== 'undefined' && chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(handleIconClick);
}
