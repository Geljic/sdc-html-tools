// ============================================================
// PPTX PARSER — JSZip-based slide text extractor
// PPTX files are ZIP archives; slide content lives at
// ppt/slides/slide1.xml, slide2.xml, etc.
// ============================================================

const PptxParser = (function () {

  const XML_ENTITIES = {
    '&apos;': "'",
    '&quot;': '"',
    '&amp;':  '&',
    '&lt;':   '<',
    '&gt;':   '>'
  };

  function decodeEntities(text) {
    return text.replace(/&(?:apos|quot|amp|lt|gt);/g, function (match) {
      return XML_ENTITIES[match] || match;
    });
  }

  // Strip all XML tags, collapse whitespace
  function stripXml(xml) {
    // Preserve paragraph breaks: replace </a:p> with newline before stripping
    let text = xml.replace(/<\/a:p>/gi, '\n');
    // Strip all remaining tags
    text = text.replace(/<[^>]*>/g, ' ');
    // Decode entities
    text = decodeEntities(text);
    // Collapse multiple spaces/tabs but preserve newlines
    text = text.split('\n').map(function (line) {
      return line.replace(/[ \t]+/g, ' ').trim();
    }).join('\n');
    // Collapse multiple blank lines
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  // Extract slide number from filename like "slide3.xml" → 3
  function slideNumber(filename) {
    const match = filename.match(/slide(\d+)\.xml$/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  // Main parse function — accepts a File object, returns Promise<Array>
  async function parsePptx(file) {
    if (!file || !file.name.match(/\.pptx$/i)) {
      throw new Error('Please upload a valid .pptx file.');
    }

    let zip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch (e) {
      throw new Error('Could not open file as a ZIP archive. Is this a valid .pptx file?');
    }

    // Find all slide XML files
    const slideFiles = [];
    zip.forEach(function (relativePath, zipEntry) {
      if (
        relativePath.match(/^ppt\/slides\/slide\d+\.xml$/i) &&
        !zipEntry.dir
      ) {
        slideFiles.push({ path: relativePath, entry: zipEntry });
      }
    });

    if (slideFiles.length === 0) {
      throw new Error('No slides found in this PPTX file. The file may be corrupted or use an unsupported format.');
    }

    // Sort numerically by slide number
    slideFiles.sort(function (a, b) {
      return slideNumber(a.path) - slideNumber(b.path);
    });

    // Extract text from each slide
    const slides = [];
    for (const sf of slideFiles) {
      const xml = await sf.entry.async('string');
      const text = stripXml(xml);
      const num  = slideNumber(sf.path);
      slides.push({
        slideNumber: num,
        text: text || '[No text content on this slide]'
      });
    }

    return slides;
  }

  return { parsePptx };

})();
