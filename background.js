// Open side panel when clicking the extension action button.
// If sidePanel API is not supported (e.g. Yandex Browser), fall back to popup.
if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} else {
  chrome.action.setPopup({ popup: 'sidepanel.html' });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'openSettings') {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  }
  if (message.action === 'openUrl') {
    chrome.tabs.create({ url: message.url });
  }
});
