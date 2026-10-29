// Debug test: capture ALL console output during FFmpeg.wasm load
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Capture ALL console messages
  page.on('console', (msg) => {
    console.log('[BROWSER ' + msg.type() + '] ' + msg.text());
  });
  page.on('pageerror', (err) => console.log('[BROWSER PAGE ERROR] ' + err.message));
  page.on('requestfailed', (req) => console.log('[BROWSER REQ FAILED] ' + req.url() + ' — ' + req.failure().errorText));
  page.on('response', (resp) => {
    if (resp.url().includes('ffmpeg') || resp.url().includes('unpkg')) {
      console.log('[BROWSER HTTP ' + resp.status() + '] ' + resp.url());
    }
  });

  console.log('Loading page...');
  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Upload test videos
  console.log('\nUploading test videos...');
  await page.setInputFiles('#fileInput', ['/tmp/vm_test/video_a.mp4', '/tmp/vm_test/video_b.mp4']);

  // Wait for ready
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('.video-row');
    return rows.length === 2 && Array.from(rows).every(r => r.querySelector('.video-status').textContent.trim() === 'Ready');
  }, { timeout: 30000 });
  console.log('Both videos ready.');

  // Click merge
  await page.click('#mergeBtn');
  console.log('Clicked merge. Waiting 60 seconds to observe load behavior...');

  // Wait 60 seconds and report what's on screen
  await page.waitForTimeout(60000);

  const state = await page.evaluate(() => {
    return {
      loadingOverlayActive: document.getElementById('loadingOverlay').classList.contains('active'),
      loadingText: document.getElementById('loadingText').textContent,
      loadingPercent: document.getElementById('loadingPercent').textContent,
      progressVisible: document.getElementById('progressSection').style.display !== 'none',
      progressStage: document.getElementById('progressStage').textContent,
      progressPercent: document.getElementById('progressPercent').textContent,
      progressDetail: document.getElementById('progressDetail').textContent,
      resultVisible: document.getElementById('resultSection').style.display !== 'none',
      errorBanner: document.getElementById('errorBanner').style.display !== 'none' ? document.getElementById('errorBanner').textContent : '(hidden)',
      ffmpegLoaded: typeof window.FFmpegWASM !== 'undefined',
    };
  });
  console.log('\n=== Page state after 60s ===');
  console.log(JSON.stringify(state, null, 2));

  await page.screenshot({ path: '/tmp/vm_html_debug.png', fullPage: true });
  console.log('Screenshot saved: /tmp/vm_html_debug.png');

  await browser.close();
})();
