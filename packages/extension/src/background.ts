export async function handleIconClick(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) return;
  await chrome.sidePanel.open({ tabId: tab.id });
  chrome.runtime.sendMessage({ type: 'analyze-tab', tabId: tab.id });
}

if (typeof chrome !== 'undefined' && chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(handleIconClick);
}
