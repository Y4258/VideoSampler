const go = document.getElementById('go');
const statusEl = document.getElementById('status');
const intervalSel = document.getElementById('interval');
const countSel = document.getElementById('count');

let timer = null;

function poll() {
  chrome.runtime.sendMessage({ cmd: 'status' }, (p) => {
    if (chrome.runtime.lastError) return;
    if (p && p.running) {
      statusEl.textContent = `采样中… ${p.done}/${p.total}`;
    }
  });
}

go.addEventListener('click', () => {
  const interval = Number(intervalSel.value);
  const count = Number(countSel.value);
  go.disabled = true;
  statusEl.textContent = `采样中… 0/${count}`;

  timer = setInterval(poll, 700);

  chrome.runtime.sendMessage({ cmd: 'start', interval, count }, (res) => {
    clearInterval(timer);
    go.disabled = false;
    if (chrome.runtime.lastError) {
      statusEl.textContent = '出错：' + chrome.runtime.lastError.message;
      return;
    }
    if (res && res.ok) {
      statusEl.textContent = `完成，${res.frames} 帧已下载`;
    } else {
      statusEl.textContent = '失败：' + (res && res.error ? res.error : '未知错误');
    }
  });
});
