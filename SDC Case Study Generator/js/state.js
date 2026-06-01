// ============================================================
// STATE — In-memory state for the Case Study Generator
// Single-session only — no localStorage persistence needed
// ============================================================

const CaseStudyState = (function () {

  const _state = {
    filename:   '',       // uploaded file name
    slideCount: 0,        // number of slides parsed
    rawSlides:  [],       // [{ slideNumber: 1, text: '...' }, ...]
    rawText:    '',       // full joined text for API prompts
    extracted:  {         // populated after API calls
      slide1:  null,
      slide2:  null,
      slide3:  null,
      slide4:  null,
      slide5:  null,
      slide6:  null,
      slide7:  null,
      slide8:  null,
      slide12: null,
      slide13: null
    },
    status: 'idle'        // idle | parsing | extracting | done | error
  };

  function reset() {
    _state.filename   = '';
    _state.slideCount = 0;
    _state.rawSlides  = [];
    _state.rawText    = '';
    _state.status     = 'idle';
    const keys = Object.keys(_state.extracted);
    keys.forEach(function (k) { _state.extracted[k] = null; });
  }

  function setFile(filename, slides) {
    _state.filename   = filename;
    _state.slideCount = slides.length;
    _state.rawSlides  = slides;
    _state.rawText    = slides
      .map(function (s) { return '[Slide ' + s.slideNumber + ']\n' + s.text; })
      .join('\n\n');
  }

  function setExtracted(slideKey, data) {
    if (Object.prototype.hasOwnProperty.call(_state.extracted, slideKey)) {
      _state.extracted[slideKey] = data;
    }
  }

  function setStatus(status) {
    _state.status = status;
  }

  function get() {
    return _state;
  }

  function getRawText() {
    return _state.rawText;
  }

  function getExtracted(slideKey) {
    return _state.extracted[slideKey];
  }

  function isComplete() {
    return Object.values(_state.extracted).every(function (v) { return v !== null; });
  }

  return {
    reset,
    setFile,
    setExtracted,
    setStatus,
    get,
    getRawText,
    getExtracted,
    isComplete
  };

})();
