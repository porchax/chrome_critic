export async function handleIconClick(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) return;
  const url = `${chrome.runtime.getURL('src/sidepanel/index.html')}?tabId=${tab.id}`;
  await chrome.windows.create({
    url,
    type: 'popup',
    width: 460,
    height: 720,
    focused: true,
  });
}

if (typeof chrome !== 'undefined' && chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(handleIconClick);
}
