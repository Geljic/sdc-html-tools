// Initialise Lucide icons once the DOM is ready.
// Call lucide.createIcons() again after any dynamic content is injected.
(function () {
  function init() {
    if (window.lucide) {
      lucide.createIcons();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
