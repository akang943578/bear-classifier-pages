const API_BASE = "https://bear-sg.jklands.com";

const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const preview = document.getElementById("preview");
const idleHint = document.getElementById("idle-hint");
const classifyBtn = document.getElementById("classify-btn");
const clearBtn = document.getElementById("clear-btn");
const statusEl = document.getElementById("status");
const results = document.getElementById("results");
const topLabel = document.getElementById("top-label");
const bars = document.getElementById("bars");

let selectedFile = null;
let previewUrl = null;

const LABEL_ZH = {
  black: "黑熊 black",
  grizzly: "棕熊 grizzly",
  teddy: "泰迪 teddy",
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function resetPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  preview.hidden = true;
  preview.removeAttribute("src");
  idleHint.hidden = false;
}

function showFile(file) {
  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
  idleHint.hidden = true;
  classifyBtn.disabled = false;
  clearBtn.disabled = false;
  results.hidden = true;
  setStatus(`已选择：${file.name}`);
}

async function uploadImage(file) {
  const form = new FormData();
  form.append("files", file, file.name);
  const res = await fetch(`${API_BASE}/gradio_api/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`上传失败（${res.status}）`);
  }
  const paths = await res.json();
  if (!Array.isArray(paths) || !paths[0]) {
    throw new Error("上传响应异常");
  }
  return paths[0];
}

async function runClassify(serverPath, file) {
  const payload = {
    data: [
      {
        path: serverPath,
        orig_name: file.name,
        meta: { _type: "gradio.FileData" },
      },
    ],
  };
  const res = await fetch(`${API_BASE}/gradio_api/run/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`识别失败（${res.status}）：${text.slice(0, 160)}`);
  }
  const json = await res.json();
  const out = json?.data?.[0];
  if (!out?.confidences) {
    throw new Error("识别结果格式异常");
  }
  return out;
}

function renderResult(out) {
  const confidences = [...out.confidences].sort(
    (a, b) => b.confidence - a.confidence
  );
  const best = confidences[0];
  topLabel.textContent = LABEL_ZH[best.label] || best.label;

  bars.innerHTML = "";
  for (const item of confidences) {
    const pct = Math.round(item.confidence * 1000) / 10;
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="bar-meta">
        <span>${LABEL_ZH[item.label] || item.label}</span>
        <span>${pct.toFixed(1)}%</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width: 0%"></div></div>
    `;
    bars.appendChild(li);
    requestAnimationFrame(() => {
      const fill = li.querySelector(".bar-fill");
      fill.style.width = `${Math.max(pct, 0.5)}%`;
    });
  }

  results.hidden = false;
}

async function classify() {
  if (!selectedFile) return;
  classifyBtn.disabled = true;
  setStatus("上传并识别中…");
  try {
    const path = await uploadImage(selectedFile);
    const out = await runClassify(path, selectedFile);
    renderResult(out);
    setStatus("完成");
  } catch (err) {
    console.error(err);
    setStatus(err.message || String(err), true);
  } finally {
    classifyBtn.disabled = !selectedFile;
  }
}

function clearAll() {
  selectedFile = null;
  fileInput.value = "";
  resetPreview();
  classifyBtn.disabled = true;
  clearBtn.disabled = true;
  results.hidden = true;
  setStatus("");
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) showFile(file);
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("is-dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("is-dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("is-dragover");
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith("image/")) {
    showFile(file);
  } else {
    setStatus("请拖入图片文件", true);
  }
});

classifyBtn.addEventListener("click", classify);
clearBtn.addEventListener("click", clearAll);
