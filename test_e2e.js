// End-to-end test: upload two real videos, merge them in-browser, verify output.
// Uses Playwright (installed globally via npm).
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const TEST_VIDEOS = [
  '/tmp/vm_test/video_a.mp4',  // 4s 1280x720 landscape
  '/tmp/vm_test/video_b.mp4',  // 3s 720x1280 portrait
];

(async () => {
  // Verify test videos exist
  for (const v of TEST_VIDEOS) {
    if (!fs.existsSync(v)) {
      console.error('Test video missing: ' + v);
      console.error('Generate them with: ffmpeg -f lavfi -i testsrc=size=1280x720:rate=30:duration=4 ...');
      process.exit(1);
    }
  }
  console.log('Test videos verified:');
  TEST_VIDEOS.forEach(v => console.log('  ' + v + ' (' + fs.statSync(v).size + ' bytes)'));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (err) => errors.push('PAGE ERROR: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text());
  });

  console.log('\nLoading page...');
  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Upload the two test videos via the hidden file input
  console.log('Uploading test videos...');
  await page.setInputFiles('#fileInput', TEST_VIDEOS);

  // Wait for both videos to show as "Ready"
  console.log('Waiting for metadata extraction...');
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('.video-row');
    if (rows.length !== 2) return false;
    const statuses = Array.from(rows).map(r => r.querySelector('.video-status').textContent.trim());
    return statuses.every(s => s === 'Ready');
  }, { timeout: 30000 });
  console.log('Both videos ready.');

  // Verify the merge button is enabled
  const mergeDisabled = await page.isDisabled('#mergeBtn');
  console.log('Merge button disabled?', mergeDisabled);
  if (mergeDisabled) {
    console.error('Merge button should be enabled!');
    await page.screenshot({ path: '/tmp/vm_html_e2e_fail.png' });
    process.exit(1);
  }

  // Take a pre-merge screenshot
  await page.screenshot({ path: '/tmp/vm_html_e2e_pre_merge.png' });
  console.log('Pre-merge screenshot saved.');

  // Click merge
  console.log('Clicking merge...');
  await page.click('#mergeBtn');

  // Wait for the loading overlay (FFmpeg.wasm download) to appear and disappear
  console.log('Waiting for FFmpeg.wasm to load (this downloads ~30 MB, cached after)...');
  try {
    await page.waitForSelector('#loadingOverlay.active', { timeout: 5000 });
    console.log('Loading overlay appeared.');
  } catch (e) {
    console.log('Loading overlay did not appear (may already be cached).');
  }

  // Wait for progress section to appear
  try {
    await page.waitForSelector('#progressSection', { state: 'visible', timeout: 10000 });
    console.log('Progress section visible.');
  } catch (e) {
    console.log('Progress section did not appear — checking for errors.');
  }

  // Wait for the result section to appear (timeout 5 minutes for slow networks + WASM encoding)
  console.log('Waiting for merge to complete (max 5 minutes)...');
  try {
    await page.waitForSelector('#resultSection', { state: 'visible', timeout: 300000 });
    console.log('Result section appeared!');
  } catch (e) {
    console.error('Timed out waiting for result section.');
    await page.screenshot({ path: '/tmp/vm_html_e2e_timeout.png' });
    const progressText = await page.evaluate(() => {
      const el = document.getElementById('progressDetail');
      return el ? el.textContent : '(no progress detail)';
    });
    console.error('Progress detail:\n' + progressText);
    process.exit(1);
  }

  // Take a result screenshot
  await page.screenshot({ path: '/tmp/vm_html_e2e_result.png', fullPage: true });
  console.log('Result screenshot saved.');

  // Read result metadata
  const resultInfo = await page.evaluate(() => {
    const downloadBtn = document.getElementById('downloadBtn');
    const shareBtn = document.getElementById('shareBtn');
    return {
      duration: document.getElementById('resultDuration').textContent,
      resolution: document.getElementById('resultResolution').textContent,
      size: document.getElementById('resultSize').textContent,
      format: document.getElementById('resultFormat').textContent,
      downloadBtnExists: !!downloadBtn,
      downloadBtnText: downloadBtn ? downloadBtn.textContent : '(none)',
      shareBtnVisible: shareBtn ? shareBtn.style.display !== 'none' : false,
      videoSrc: document.getElementById('resultPreview').src ? '(set)' : '(empty)',
      canShareFiles: !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob()], 'test.mp4', { type: 'video/mp4' })] })),
    };
  });
  console.log('\n=== Result ===');
  console.log(JSON.stringify(resultInfo, null, 2));

  // Click the download button — in headless Chrome, navigator.share is unavailable,
  // so it falls through to opening a new tab or creating an <a download>.
  console.log('\nTriggering download...');
  // Override window.open to capture the blob URL instead of opening a tab
  await page.evaluate(() => {
    window.__capturedOpen = null;
    const origOpen = window.open;
    window.open = function(url, target) {
      window.__capturedOpen = url;
      // Simulate a successful open without actually opening a tab
      return { focus: () => {}, close: () => {} };
    };
  });
  await page.click('#downloadBtn');
  await page.waitForTimeout(2000);

  // Check what happened
  const downloadResult = await page.evaluate(() => {
    return {
      capturedOpen: window.__capturedOpen || null,
      downloadBtnText: document.getElementById('downloadBtn').textContent,
    };
  });
  console.log('Download result:', JSON.stringify(downloadResult, null, 2));

  // If a blob URL was captured (new tab approach), fetch it and save to disk
  let downloadedSize = 0;
  if (downloadResult.capturedOpen && downloadResult.capturedOpen.startsWith('blob:')) {
    // Can't fetch blob: URLs from Node — instead, grab the blob from the page context
    const blobData = await page.evaluate(async (url) => {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const reader = new FileReader();
      return new Promise(resolve => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }, downloadResult.capturedOpen);
    // Convert data URL to buffer
    const base64 = blobData.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    const downloadPath = '/tmp/vm_html_downloaded.mp4';
    fs.writeFileSync(downloadPath, buffer);
    downloadedSize = buffer.length;
    console.log('Downloaded file (via blob capture): ' + downloadPath + ' (' + downloadedSize + ' bytes)');
  } else {
    // Fallback: extract the blob URL from the video element's src
    const videoSrc = await page.evaluate(() => document.getElementById('resultPreview').src);
    if (videoSrc && videoSrc.startsWith('blob:')) {
      const blobData = await page.evaluate(async (url) => {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const reader = new FileReader();
        return new Promise(resolve => {
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      }, videoSrc);
      const base64 = blobData.split(',')[1];
      const buffer = Buffer.from(base64, 'base64');
      const downloadPath = '/tmp/vm_html_downloaded.mp4';
      fs.writeFileSync(downloadPath, buffer);
      downloadedSize = buffer.length;
      console.log('Downloaded file (via video src): ' + downloadPath + ' (' + downloadedSize + ' bytes)');
    }
  }

  // Verify the downloaded file is a valid MP4 with ffprobe
  const { execSync } = require('child_process');
  try {
    const probe = execSync(
      'ffprobe -v error -show_format -show_streams -print_format json ' + downloadPath,
      { encoding: 'utf-8', timeout: 15000 }
    );
    const meta = JSON.parse(probe);
    const v = meta.streams.find(s => s.codec_type === 'video');
    const a = meta.streams.find(s => s.codec_type === 'audio');
    console.log('\n=== ffprobe verification ===');
    console.log('Duration:', meta.format.duration, 's');
    console.log('Video:', v ? (v.codec_name + ' ' + v.width + 'x' + v.height) : 'NONE');
    console.log('Audio:', a ? a.codec_name : 'NONE');
    console.log('Container:', meta.format.format_name);

    // Verify expectations
    const dur = parseFloat(meta.format.duration);
    if (dur < 5 || dur > 9) {
      console.error('FAIL: duration ' + dur + 's outside expected ~7s range');
      process.exit(1);
    }
    if (!v || v.codec_name !== 'h264') {
      console.error('FAIL: video codec is not h264');
      process.exit(1);
    }
    console.log('\n✅✅✅ END-TO-END TEST PASSED ✅✅✅');
    console.log('Uploaded 2 videos → merged in browser → downloaded valid H.264 MP4');
    console.log('Final video: ' + downloadPath);
  } catch (e) {
    console.error('ffprobe failed:', e.message);
    process.exit(1);
  }

  await browser.close();

  if (errors.length > 0) {
    console.log('\n=== Page errors during test ===');
    errors.forEach(e => console.log(e));
  }

  process.exit(0);
})();
