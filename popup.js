const extentionPerfix = '[Ex: BALAM]';
const btn = document.querySelector('.use-btn');
btn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.executeScript(
      tabs[0].id,
      {
        code: `let ExBalamScript = document.createElement('script');ExBalamScript.src = '${chrome.extension.getURL('executeCode.js')}';document.body.appendChild(ExBalamScript)` });
  });
  window.close();
})