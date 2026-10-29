# Video Merger

A single-file web application that lets you merge multiple videos into one — right in your browser. No server, no uploads, videos never leave your device. Built with FFmpeg.wasm.

---

## What it does

1. Open the web app on any device (desktop, laptop, iPad, iPhone, Android)
2. Select multiple video files (or drag-and-drop)
3. Reorder them with ↑/↓ buttons
4. Pick an output preset (1080p / 720p / original)
5. Click **Merge Videos**
6. Preview the result
7. Download the merged MP4

All processing happens locally in your browser using FFmpeg compiled to WebAssembly. Your videos are **never uploaded** to any server.

---

## Quick start

### The simple way (recommended)

The app is a single HTML file — `video-merger.html` (~55 KB). You can:

1. **Download** `video-merger.html`
2. **Host it on any static web server** (see below — opening directly from disk won't work due to browser security)
3. **Open the URL** in your browser
4. **Merge videos**

### Why you can't just double-click the file

Browsers block `fetch()` calls from `file://` origin to `https://` URLs. When you open the HTML file directly (e.g., `file:///Users/you/Downloads/video-merger.html`), the browser refuses to load FFmpeg.wasm from the CDN, and you'll see:

> `Error: Merge failed: TypeError: Failed to fetch`

**You must serve the file over HTTP.** This is a browser security feature, not a bug.

---

## How to serve the file (pick one)

### Option A — Python (already installed on most computers)

```bash
# Open Terminal (macOS/Linux) or Command Prompt (Windows)
# Navigate to the folder containing video-merger.html
cd /path/to/folder

# Start a simple HTTP server on port 8000
python -m http.server 8000

# Or, if your system uses python3 explicitly:
python3 -m http.server 8000
```

Then open `http://localhost:8000/video-merger.html` in your browser.

To stop the server: press `Ctrl + C` in the Terminal.

### Option B — Node.js

If you have Node.js installed:

```bash
cd /path/to/folder
npx http-server -p 8080
```

Then open `http://localhost:8080/video-merger.html`.

### Option C — VS Code

If you use Visual Studio Code:

1. Install the **Live Server** extension
2. Right-click `video-merger.html` → **Open with Live Server**
3. The page opens at `http://127.0.0.1:5500/video-merger.html`

### Option D — Upload to a free static host

Upload `video-merger.html` to any of these free hosts:

| Host | How |
|---|---|
| **Netlify Drop** | Drag-and-drop the file at https://app.netlify.com/drop |
| **GitHub Pages** | Push the file to a GitHub repo, enable Pages in Settings |
| **Vercel** | `npx vercel` in the folder containing the file |
| **Cloudflare Pages** | Connect a Git repo, or upload a ZIP |
| **Surge.sh** | `npx surge` in the folder |

Then open the hosted URL on any device.

### Option E — Online demo

If you just want to test the concept (different UI, same engine):

Open https://ffmpegwasm.netlify.app/ in your browser.

---

## How to use it on iPad / iPhone

### Step-by-step (recommended: host the file first)

1. **Host the file** using one of the options above (Netlify Drop is the easiest — takes 30 seconds)
2. **Open the URL in Safari** on your iPad
3. **Tap "Add Videos"** or drag videos onto the page
4. **Reorder** with the ↑/↓ buttons if needed
5. **Tap "Merge Videos"**
6. **Wait** for the first load (~30 seconds — downloads ~30 MB of FFmpeg engine, cached afterwards)
7. **Preview** the merged video
8. **Tap "↓ Save Video"**
   - This opens the native iOS share sheet
   - Choose **"Save Video"** to save to Photos, OR
   - Choose **"Save to Files"** to save to the Files app
9. If "Save Video" doesn't appear, **long-press the video preview** and choose "Save Video" from the popup

### Using it offline

Once FFmpeg.wasm is cached (after the first successful merge), the app works **offline** — even with no internet connection. Just keep the URL bookmarked.

To add the app to your iPad home screen:
- Tap the **Share** button in Safari
- Tap **"Add to Home Screen"**
- Now you have a one-tap app icon

---

## Supported browsers

| Browser | Status | Notes |
|---|---|---|
| Chrome 90+ (desktop) | ✅ Fully supported | Best performance |
| Edge 90+ (desktop) | ✅ Fully supported | |
| Firefox 90+ (desktop) | ✅ Fully supported | |
| Safari 15+ (desktop) | ✅ Fully supported | |
| Safari 15+ (iPad/iPhone) | ✅ Fully supported | iOS 15+ required for Web Share API |
| Chrome 90+ (Android) | ✅ Fully supported | |
| Older Safari (iOS 14 and below) | ⚠ Partial | Merge works, but download falls back to long-press |

---

## Supported video formats

| Format | Extension | Read | Merge |
|---|---|---|---|
| MP4 / MOV | `.mp4` `.mov` | ✅ | ✅ |
| Matroska | `.mkv` | ✅ | ✅ |
| WebM | `.webm` | ✅ | ✅ |
| AVI | `.avi` | ✅ | ✅ |
| M4V / 3GP | `.m4v` `.3gp` | ✅ | ✅ |
| M4A (audio only) | `.m4a` | ✅ | ✅ |

---

## Output presets

Choose the output quality in the dropdown before clicking Merge:

| Preset | Resolution | Use case |
|---|---|---|
| **1080p H.264** (default) | 1920×1080 | Best balance of quality and speed |
| **720p H.264** | 1280×720 | Smaller files, faster encoding |
| **4K H.264** | 3840×2160 | High quality, very slow on CPU |
| **Original (concat only)** | Inherits from first input | Fastest — no re-encoding. Use when all videos have the same codec/resolution |

If you pick "Original" and the videos have different resolutions/codecs, the app automatically switches to re-encode mode with normalization.

---

## How it works (technical)

```
Browser
  ↓
  Loads video-merger.html
  ↓
  Loads FFmpeg.wasm (~30 MB, cached after first load)
    - From unpkg.com (primary CDN)
    - Falls back to jsdelivr, statically.io, esm.sh if unpkg is blocked
  ↓
  User selects videos → browser reads them as File objects
  ↓
  User clicks Merge
  ↓
  Videos are written to FFmpeg.wasm's in-memory virtual filesystem
  ↓
  FFmpeg runs in a Web Worker (classic worker, monkey-patched for Safari)
  ↓
  Concat + re-encode with libx264 + AAC
  ↓
  Output MP4 is read from the virtual filesystem
  ↓
  User downloads via Web Share API (iOS) or <a download> (desktop)
```

### Why a classic worker?

Safari on iPad/iPhone blocks module workers created from blob URLs. The app monkey-patches `window.Worker` to intercept FFmpeg's cross-origin worker URL and redirect it to a same-origin blob URL with `type: undefined` (classic worker). Classic workers can use `importScripts()` to load cross-origin scripts, which Safari supports reliably.

### CDN fallback chain

If the primary CDN (`unpkg.com`) is blocked or unreachable, the app tries these in order:

1. `https://unpkg.com/@ffmpeg/...`
2. `https://cdn.jsdelivr.net/npm/@ffmpeg/...`
3. `https://cdn.statically.io/gh/ffmpegwasm/ffmpeg.wasm/main/packages/@ffmpeg/...`
4. `https://esm.sh/@ffmpeg/...`

---

## Limitations

| Limitation | Reason | Workaround |
|---|---|---|
| **Slower than native FFmpeg** | WASM is ~10× slower than native CPU encoding | Be patient — a 1-minute video takes ~10 seconds to merge |
| **Memory cap (~2-4 GB)** | Browsers limit WebAssembly memory | Avoid merging videos larger than 1 GB each |
| **First load is slow** | Downloads ~30 MB of FFmpeg engine | Cached after first load — subsequent loads are instant |
| **Requires internet on first load** | Fetches FFmpeg.wasm from CDN | After caching, works offline |
| **No hardware encoding** | WASM doesn't support NVENC | CPU encoding only |
| **iOS 14 and below** | No Web Share API | Use long-press on the video preview |

---

## Troubleshooting

### "Failed to fetch" error

You opened the file via `file://` protocol. Serve it over HTTP using one of the options above.

### "Loading FFmpeg engine…" hangs forever

Your firewall or network blocks all four CDNs. Try:
- A different network (mobile hotspot, VPN)
- Host the file on a corporate intranet with FFmpeg.wasm bundled locally (more complex setup)

### Hang at 96-98% during Finalizing

This was a known FFmpeg.wasm 0.12 bug fixed in the latest version. The app now:
- Hard-times-out the readFile step after 60 seconds
- Force-terminates and reloads FFmpeg after each merge (so the second merge starts fresh)
- Shows an animated "Finalizing" indicator with a hint

If it still happens, click "Merge Videos" again — the engine is cached, so the second attempt starts immediately and usually succeeds.

### Download doesn't work on iPad

Make sure you're on iOS 15+. The app uses the Web Share API (`navigator.share({ files: [...] })`) which iOS 15+ supports. If the share sheet doesn't appear, long-press the video preview and choose "Save Video" from the popup.

### "FFmpeg failed during encoding"

Check the progress log (the dark text box under the progress bar). FFmpeg usually tells you what went wrong:
- `Unknown codec` → your video uses a codec FFmpeg.wasm doesn't support (rare)
- `Permission denied` → the browser blocked file system access (unusual)
- `Cannot allocate memory` → the video is too large

---

## Privacy

- ✅ Videos never leave your device
- ✅ No server-side processing
- ✅ No tracking, no analytics
- ✅ No cookies
- ✅ The only network requests are to load FFmpeg.wasm from a CDN (cached after first load)
- ✅ Once cached, the app works fully offline

---

## Building from source

The app is a single HTML file — there's no build step. To modify it:

1. Open `video-merger.html` in any text editor (VS Code, Sublime, Notepad++)
2. Edit the HTML, CSS, or JavaScript
3. Save and refresh the browser

### File structure

```
video-merger.html
├── <style>          ~250 lines of CSS
├── <body>           ~80 lines of HTML structure
└── <script>         ~900 lines of JavaScript
    ├── State management
    ├── File selection + drag-and-drop
    ├── Video metadata extraction (via <video> element)
    ├── FFmpeg.wasm loader (with CDN fallbacks + monkey-patched Worker)
    ├── Merge logic (concat + re-encode)
    ├── Progress reporting (FFmpeg stderr parsing)
    ├── Download (Web Share API + fallbacks)
    └── iOS detection + hints
```

---

## Credits

Built with:
- [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) — FFmpeg compiled to WebAssembly
- [unpkg](https://unpkg.com), [jsDelivr](https://cdn.jsdelivr.net), [Statically](https://cdn.statically.io), [esm.sh](https://esm.sh) — CDN delivery

---

## License

The `video-merger.html` file is yours to use, modify, and distribute freely. FFmpeg.wasm is MIT-licensed. FFmpeg itself is LGPL/GPL (the WASM build is compiled with `--enable-gpl`).

---

## FAQ

**Q: Can I use this offline?**
A: Yes — after the first successful load (which downloads ~30 MB of FFmpeg.wasm), the browser caches it. Subsequent loads work offline.

**Q: How big a video can I merge?**
A: Depends on your browser's memory limit (usually 2-4 GB). For each video, FFmpeg.wasm needs roughly 3-5× the file size in memory during processing. So a 500 MB video may need ~2 GB of RAM.

**Q: Can I merge videos with different frame rates?**
A: Yes — the app normalizes them to 30 fps during re-encoding.

**Q: Can I merge audio-only files?**
A: Yes — `.m4a` files are supported. The output will be a video with no video stream (just audio), wrapped in an MP4 container.

**Q: Does it work on Android?**
A: Yes — tested on Chrome 90+ on Android. The Web Share API works for download.

**Q: Can I burn in subtitles?**
A: Not in this version. If you want this feature, ask — it's a small addition to the FFmpeg command.

**Q: Why is the first merge so slow?**
A: The first merge downloads ~30 MB of FFmpeg engine. After that, it's cached and subsequent merges start instantly.

**Q: Can I host this on my own server?**
A: Yes — it's a single HTML file with no dependencies beyond the CDNs for FFmpeg.wasm. Upload it to any static host.

---

## Need help?

If you run into an issue not covered here, capture these two things:

1. **The error message** (the red banner at the bottom of the page)
2. **The progress log** (the dark text box under the progress bar — scroll to the bottom)

With those, you can diagnose most issues yourself by reading the FFmpeg output.
