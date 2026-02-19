// Open side panel when clicking the extension action button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'openSettings') {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  }
  if (message.action === 'openUrl') {
    chrome.tabs.create({ url: message.url });
  }
});
