const API_BASE = "https://bear-sg.jklands.com";
/** Gradio auth username — matches WEB_USER on the server. Password is WEB_PASS. */
const AUTH_USER = "akang943578";
const SESSION_FLAG = "bearClassifierLoggedIn";

const gate = document.getElementById("gate");
const app = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const passwordInput = document.getElementById("password-input");
const loginStatus = document.getElementById("login-status");
const logoutBtn = document.getElementById("logout-btn");

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

/** All Gradio requests must include cookies from /login. */
function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: options.headers || {},
  });
}

function setLoginStatus(message, isError = false) {
  loginStatus.textContent = message;
  loginStatus.classList.toggle("is-error", isError);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function showApp() {
  gate.hidden = true;
  app.hidden = false;
  sessionStorage.setItem(SESSION_FLAG, "1");
}

function showGate() {
  gate.hidden = false;
  app.hidden = true;
  sessionStorage.removeItem(SESSION_FLAG);
  passwordInput.value = "";
  passwordInput.focus();
}

async function verifySession() {
  const res = await apiFetch("/gradio_api/info");
  if (res.status === 401) return false;
  if (!res.ok) throw new Error(`验证失败（${res.status}）`);
  return true;
}

async function loginWithPassword(password) {
  const body = new URLSearchParams({
    username: AUTH_USER,
    password,
  });
  const res = await apiFetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error("密码错误");
  }
  if (!res.ok) {
    throw new Error(`登录失败（${res.status}）`);
  }
  const data = await res.json().catch(() => ({}));
  if (data && data.success === false) {
    throw new Error("密码错误");
  }
  const ok = await verifySession();
  if (!ok) {
    throw new Error("密码错误或 Cookie 未生效（可尝试关闭无痕模式）");
  }
  showApp();
  setLoginStatus("");
}

async function logout() {
  try {
    await apiFetch("/logout");
  } catch {
    /* ignore */
  }
  clearAll();
  showGate();
  setLoginStatus("已退出");
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
  const res = await apiFetch("/gradio_api/upload", {
    method: "POST",
    body: form,
  });
  if (res.status === 401) {
    await logout();
    throw new Error("登录已失效，请重新输入密码");
  }
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
  const res = await apiFetch("/gradio_api/run/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    await logout();
    throw new Error("登录已失效，请重新输入密码");
  }
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

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = passwordInput.value;
  if (!password) return;
  const btn = document.getElementById("login-btn");
  btn.disabled = true;
  setLoginStatus("验证中…");
  try {
    await loginWithPassword(password);
  } catch (err) {
    setLoginStatus(err.message || String(err), true);
  } finally {
    btn.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => {
  logout();
});

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

(async function boot() {
  try {
    if (await verifySession()) {
      showApp();
      return;
    }
  } catch {
    /* fall through to gate */
  }
  showGate();
  if (sessionStorage.getItem(SESSION_FLAG)) {
    setLoginStatus("登录已过期，请重新输入密码", true);
  }
})();
