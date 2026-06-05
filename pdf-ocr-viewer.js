/**
 * Hybrid PDF Text Layer & OCR Viewer Module
 * Combines pdfjs-dist text layer and tesseract.js OCR to provide selectable text.
 */
class HybridPdfViewer {
  constructor(options = {}) {
    this.worker = null;
    this.workerPromise = null;
    this.lang = options.lang || 'eng';
    this.tesseractPath = options.tesseractPath || './node_modules/tesseract.js/dist/tesseract.min.js';
  }

  /**
   * Lazy-loads Tesseract script if not already present.
   */
  async loadTesseract() {
    if (typeof Tesseract !== 'undefined') return;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = this.tesseractPath;
      script.onload = () => resolve();
      script.onerror = () => {
        // Fallback to CDN if local path fails (e.g. running in browser test or environment issue)
        const fallback = document.createElement('script');
        fallback.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        fallback.onload = () => resolve();
        fallback.onerror = (err) => reject(new Error('Failed to load Tesseract.js: ' + err.message));
        document.head.appendChild(fallback);
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Initializes and caches a shared Tesseract worker to avoid initialization overhead.
   */
  async getWorker() {
    if (this.worker) return this.worker;
    if (this.workerPromise) return this.workerPromise;

    this.workerPromise = (async () => {
      await this.loadTesseract();
      console.log(`[HybridPdfViewer] Initializing Tesseract worker for lang="${this.lang}"...`);
      try {
        // Modern Tesseract.js v7/v5 creation with local core/worker paths
        const worker = await Tesseract.createWorker(this.lang, 3, {
          workerPath: './node_modules/tesseract.js/dist/worker.min.js',
          corePath: './node_modules/tesseract.js-core/',
          logger: m => console.log('[Tesseract Worker Progress]:', m),
          errorHandler: err => console.error('[Tesseract Worker Error]:', err)
        });
        console.log('[HybridPdfViewer] Tesseract worker initialized successfully.');
        this.worker = worker;
        return worker;
      } catch (err) {
        console.warn('[HybridPdfViewer] Tesseract local createWorker failed, trying fallback without arguments:', err);
        try {
          const worker = await Tesseract.createWorker({
            workerPath: './node_modules/tesseract.js/dist/worker.min.js',
            corePath: './node_modules/tesseract.js-core/',
            logger: m => console.log('[Tesseract Worker Progress fallback]:', m),
            errorHandler: err => console.error('[Tesseract Worker Error fallback]:', err)
          });
          await worker.loadLanguage(this.lang);
          await worker.initialize(this.lang);
          console.log('[HybridPdfViewer] Fallback Tesseract worker initialized.');
          this.worker = worker;
          return worker;
        } catch (fallbackErr) {
          console.error('[HybridPdfViewer] All Tesseract worker initializations failed:', fallbackErr);
          throw fallbackErr;
        }
      }
    })();

    return this.workerPromise;
  }

  /**
   * Main entry point to render a selectable overlay (standard text or OCR) on a rendered page.
   * @param {Object} pdfPage - pdfjs PDFPageProxy instance
   * @param {HTMLCanvasElement} canvas - Rendered page canvas
   * @param {HTMLElement} pageContainer - The relatively positioned '.pdfpage' wrapper
   * @param {Object} viewport - pdfjs PageViewport (CSS dimensions)
   */
  async renderTextOverlay(pdfPage, canvas, pageContainer, viewport) {
    let textContent = null;
    try {
      textContent = await pdfPage.getTextContent();
    } catch (e) {
      console.error('Failed to get page text content:', e);
    }

    const hasText = textContent && textContent.items && textContent.items.some(item => item.str && item.str.trim().length > 0);

    // Create the text layer container
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.width = Math.round(viewport.width) + 'px';
    textLayerDiv.style.height = Math.round(viewport.height) + 'px';
    textLayerDiv.style.position = 'absolute';
    textLayerDiv.style.left = '0';
    textLayerDiv.style.top = '0';
    pageContainer.appendChild(textLayerDiv);

    if (hasText) {
      // PATH A: Digital PDF
      try {
        const renderTask = pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: viewport,
          textDivs: []
        });
        if (renderTask && typeof renderTask.promise !== 'undefined') {
          await renderTask.promise;
        } else if (renderTask && typeof renderTask.then === 'function') {
          await renderTask;
        }
      } catch (err) {
        console.error('Digital text layer rendering failed:', err);
      }
    } else {
      // PATH B: Scanned/Non-OCR PDF (Tesseract OCR)
      textLayerDiv.classList.add('ocrLayer');
      // Run OCR asynchronously in the background so page rendering is not blocked
      this.runOcr(canvas, textLayerDiv, viewport, pageContainer).catch(err => {
        console.error('Background OCR run failed:', err);
      });
    }
  }

  /**
   * Performs Tesseract OCR on the page canvas and adds overlay spans.
   */
  async runOcr(canvas, textLayerDiv, viewport, pageContainer) {
    // Inject page status indicator
    const ocrStatus = document.createElement('div');
    ocrStatus.className = 'ocr-status-indicator';
    ocrStatus.innerHTML = '<span class="ocr-spinner"></span> Performing OCR...';
    pageContainer.appendChild(ocrStatus);

    console.log('[HybridPdfViewer] Starting OCR execution on page canvas...');
    try {
      const worker = await this.getWorker();
      const imageData = canvas.toDataURL('image/png');
      console.log('[HybridPdfViewer] Performing Tesseract recognize (with blocks)...');
      // Pass blocks: true to request layouts and words coordinates
      const result = await worker.recognize(imageData, {}, { blocks: true });
      console.log('[HybridPdfViewer] OCR recognize completed successfully.');

      ocrStatus.remove();

      // Extract words from blocks fallback
      const words = (result && result.data && result.data.words) || 
                    (result && result.data && this.extractWordsFromBlocks(result.data.blocks)) || [];

      if (words && words.length > 0) {
        console.log(`[HybridPdfViewer] Found ${words.length} words. scaling viewport:${viewport.width}x${viewport.height} to canvas:${canvas.width}x${canvas.height}`);
        const scaleX = viewport.width / canvas.width;
        const scaleY = viewport.height / canvas.height;
        const fragment = document.createDocumentFragment();

        const ctx = canvas.getContext('2d');
        let loggedWords = 0;

        for (const word of words) {
          if (!word.text || word.text.trim().length === 0) continue;

          const span = document.createElement('span');
          span.textContent = word.text + ' '; // Space allows text selection copying to parse word boundaries

          const x = word.bbox.x0 * scaleX;
          const y = word.bbox.y0 * scaleY;
          const w = (word.bbox.x1 - word.bbox.x0) * scaleX;
          const h = (word.bbox.y1 - word.bbox.y0) * scaleY;

          span.style.position = 'absolute';
          span.style.fontFamily = 'monospace';
          span.style.left = x + 'px';
          span.style.top = y + 'px';
          span.style.width = w + 'px';
          span.style.height = h + 'px';
          span.style.fontSize = h + 'px';

          if (loggedWords < 3) {
            console.log(`[HybridPdfViewer] Word "${word.text}" bbox:`, word.bbox, `scaled: left=${x.toFixed(1)}px, top=${y.toFixed(1)}px, w=${w.toFixed(1)}px, h=${h.toFixed(1)}px`);
            loggedWords++;
          }

          // Measure text to prevent horizontal selection offset/drift
          ctx.font = `${word.bbox.y1 - word.bbox.y0}px monospace`;
          const textWidthInCss = ctx.measureText(word.text).width * scaleX;
          if (textWidthInCss > 0) {
            const hScale = w / textWidthInCss;
            span.style.transform = `scaleX(${hScale})`;
          }

          fragment.appendChild(span);
        }

        textLayerDiv.appendChild(fragment);
      } else {
        console.log('[HybridPdfViewer] No words extracted from OCR result.');
      }
    } catch (err) {
      console.error('OCR processing failed:', err);
      ocrStatus.className = 'ocr-status-indicator error';
      ocrStatus.textContent = 'OCR Failed';
      setTimeout(() => ocrStatus.remove(), 3000);
    }
  }

  /**
   * Flat-maps word elements from hierarchical layout blocks.
   * @param {Array} blocks - Tesseract blocks output array
   */
  extractWordsFromBlocks(blocks) {
    const words = [];
    if (!blocks) return words;
    for (const block of blocks) {
      if (!block.paragraphs) continue;
      for (const paragraph of block.paragraphs) {
        if (!paragraph.lines) continue;
        for (const line of paragraph.lines) {
          if (!line.words) continue;
          for (const word of line.words) {
            words.push(word);
          }
        }
      }
    }
    return words;
  }

  /**
   * Terminates the active worker instance to release system resources.
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.workerPromise = null;
    }
  }
}

// Export module globally
window.HybridPdfViewer = HybridPdfViewer;
