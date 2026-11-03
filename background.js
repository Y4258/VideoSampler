// 视频采样器 · 后台
// 职责：按间隔调用 chrome.tabs.captureVisibleTab 截图 → 拼成网格 → 下载 PNG

let running = false;
let progress = { running: false, done: 0, total: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
  }
  return 'data:image/png;base64,' + btoa(bin);
}

function timestampLabel(i, intervalSec) {
  const t = i * intervalSec;
  const m = String(Math.floor(t / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  return `${m}:${s}`;
}

async function composeGrid(bitmaps, intervalSec, cols) {
  const n = bitmaps.length;
  const rows = Math.ceil(n / cols);
  const tileW = 640;
  const tileH = Math.round((bitmaps[0].height / bitmaps[0].width) * tileW);
  const labelH = 22;
  const gap = 6;
  const W = cols * tileW + (cols + 1) * gap;
  const H = rows * (tileH + labelH) + (rows + 1) * gap;

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111418';
  ctx.fillRect(0, 0, W, H);
  ctx.font = 'bold 14px sans-serif';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = gap + c * (tileW + gap);
    const y = gap + r * (tileH + labelH + gap);
    ctx.drawImage(bitmaps[i], x, y, tileW, tileH);
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(x, y + tileH, tileW, labelH);
    ctx.fillStyle = '#9fe8ff';
    ctx.fillText(`#${i + 1}  ${timestampLabel(i, intervalSec)}`, x + 8, y + tileH + labelH / 2);
  }
  return canvas.convertToBlob({ type: 'image/png' });
}

async function runSampling(intervalSec, count) {
  if (running) return { ok: false, error: '已经在采样中' };
  running = true;
  progress = { running: true, done: 0, total: count };

  try {
    const bitmaps = [];
    for (let i = 0; i < count; i++) {
      const dataUrl = await chrome.tabs.captureVisibleTab({
        format: 'jpeg',
        quality: 92
      });
      const blob = await (await fetch(dataUrl)).blob();
      bitmaps.push(await createImageBitmap(blob));
      progress.done = i + 1;
      if (i < count - 1) await sleep(intervalSec * 1000);
    }

    const cols = count <= 4 ? 2 : count <= 9 ? 3 : 4;
    const outBlob = await composeGrid(bitmaps, intervalSec, cols);
    const url = await blobToDataUrl(outBlob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await chrome.downloads.download({
      url,
      filename: `视频采样/${stamp}_${count}帧.png`,
      saveAs: false
    });
    return { ok: true, frames: count };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    running = false;
    progress = { running: false, done: progress.done, total: progress.total };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.cmd === 'start') {
    runSampling(msg.interval || 5, msg.count || 9).then(sendResponse);
    return true; // 异步
  }
  if (msg && msg.cmd === 'status') {
    sendResponse(progress);
    return false;
  }
});
