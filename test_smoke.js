// Quick browser smoke test for the Video Merger single-HTML app.
// Uses Playwright (installed globally via npm).
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  const errors = [];
  const consoleMessages = [];

  page.on('console', (msg) => {
    consoleMessages.push('[' + msg.type() + '] ' + msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push('PAGE ERROR: ' + err.message + '\n' + (err.stack || ''));
  });
  page.on('requestfailed', (req) => {
    errors.push('REQUEST FAILED: ' + req.url() + ' — ' + req.failure().errorText);
  });

  console.log('Loading page...');
  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle', timeout: 30000 });

  // Wait a moment for scripts to execute
  await page.waitForTimeout(2000);

  // Check that key elements exist
  const title = await page.title();
  console.log('Title:', title);

  const hasDropzone = await page.locator('#dropzone').count();
  const hasFileInput = await page.locator('#fileInput').count();
  const hasVideoList = await page.locator('#videoList').count();
  const hasMergeBtn = await page.locator('#mergeBtn').count();
  console.log('Elements found — dropzone:', hasDropzone, 'fileInput:', hasFileInput,
              'videoList:', hasVideoList, 'mergeBtn:', hasMergeBtn);

  // Check that FFmpeg.wasm globals are available
  const ffmpegLoaded = await page.evaluate(() => {
    return {
      hasFFmpegWASM: typeof window.FFmpegWASM !== 'undefined',
      hasFFmpegUtil: typeof window.FFmpegUtil !== 'undefined',
      ffmpegClassExists: typeof window.FFmpegWASM !== 'undefined' && typeof window.FFmpegWASM.FFmpeg === 'function',
      utilHasFetchFile: typeof window.FFmpegUtil !== 'undefined' && typeof window.FFmpegUtil.fetchFile === 'function',
      utilHasToBlobURL: typeof window.FFmpegUtil !== 'undefined' && typeof window.FFmpegUtil.toBlobURL === 'function',
    };
  });
  console.log('FFmpeg globals:', JSON.stringify(ffmpegLoaded, null, 2));

  // Take a screenshot
  await page.screenshot({ path: '/tmp/vm_html_screenshot.png', fullPage: true });
  console.log('Screenshot saved: /tmp/vm_html_screenshot.png');

  // Report errors
  if (errors.length > 0) {
    console.log('\n=== ERRORS ===');
    errors.forEach(e => console.log(e));
  } else {
    console.log('\n=== No page errors ===');
  }

  console.log('\n=== Console messages ===');
  consoleMessages.slice(0, 20).forEach(m => console.log(m));

  await browser.close();

  if (errors.length > 0 || !ffmpegLoaded.ffmpegClassExists) {
    process.exit(1);
  }
  console.log('\n✓ Smoke test PASSED');
})();
