const STORAGE_KEY = "resume-builder-v2";
const THEME_KEY = "resume-builder-theme";
const PHOTO_KEY = "resume-builder-photo";
const TEMPLATE_KEY = "resume-builder-template";

const resumeForm = document.querySelector("#resumeForm");
const printBtn = document.querySelector("#printBtn");
const clearBtn = document.querySelector("#clearBtn");
const loadDemoBtn = document.querySelector("#loadDemoBtn");
const themeToggleBtn = document.querySelector("#themeToggleBtn");
const particleCanvas = document.querySelector("#particleCanvas");
const resumePreview = document.querySelector("#resumePreview");
const fitStatus = document.querySelector("#fitStatus");
const singlePageBtn = document.querySelector("#singlePageBtn");
const doublePageBtn = document.querySelector("#doublePageBtn");
const photoInput = document.querySelector("#photoInput");
const previewPhoto = document.querySelector("#previewPhoto");
const cropDialog = document.querySelector("#cropDialog");
const cropCanvas = document.querySelector("#cropCanvas");
const cropZoom = document.querySelector("#cropZoom");
const applyCropBtn = document.querySelector("#applyCropBtn");
const cancelCropBtn = document.querySelector("#cancelCropBtn");

// Export/Import buttons
const exportJsonBtn = document.querySelector("#exportJsonBtn");
const exportMdBtn = document.querySelector("#exportMdBtn");
const exportTxtBtn = document.querySelector("#exportTxtBtn");
const importJsonBtn = document.querySelector("#importJsonBtn");
const fileInput = document.querySelector("#fileInput");

// Template buttons
const templateClassicBtn = document.querySelector("#templateClassicBtn");
const templateModernBtn = document.querySelector("#templateModernBtn");
const templateMinimalBtn = document.querySelector("#templateMinimalBtn");
const templateElegantBtn = document.querySelector("#templateElegantBtn");

const textTargets = {
  name: document.querySelector('[data-field="name"]'),
  title: document.querySelector('[data-field="title"]'),
  summary: document.querySelector('[data-field="summary"]')
};

const listTargets = {
  education: document.querySelector('[data-list="education"]'),
  projects: document.querySelector('[data-list="projects"]'),
  skills: document.querySelector('[data-list="skills"]')
};

function parseMultiLine(input = "") {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildContactText(data) {
  const parts = [data.phone, data.email, data.city, data.link].filter(Boolean);
  return parts.length ? parts.join(" | ") : "电话 | 邮箱 | 城市 | 链接";
}

function setText(target, value, fallback) {
  target.textContent = value?.trim() ? value.trim() : fallback;
}

function setList(listEl, items, fallback) {
  if (!items.length) {
    listEl.innerHTML = `<li>${fallback}</li>`;
    return;
  }
  listEl.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function readFormData() {
  return Object.fromEntries(new FormData(resumeForm).entries());
}

function writeFormData(data) {
  Object.keys(data).forEach((key) => {
    if (resumeForm.elements[key]) {
      resumeForm.elements[key].value = data[key];
    }
  });
}

function renderPreview(data) {
  setText(textTargets.name, data.name, "你的姓名");
  setText(textTargets.title, data.title, "你的求职意向");
  setText(textTargets.summary, data.summary, "这里会显示你的个人简介。");

  const contactEl = document.querySelector('[data-field="contact"]');
  contactEl.textContent = buildContactText(data);

  setList(
    listTargets.education,
    parseMultiLine(data.education),
    "这里会显示你的教育经历。"
  );
  setList(
    listTargets.projects,
    parseMultiLine(data.projects),
    "这里会显示你的项目经历。"
  );
  setList(listTargets.skills, parseMultiLine(data.skills), "这里会显示你的技能清单。");
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sync() {
  const data = readFormData();
  renderPreview(data);
  saveData(data);
  fitResumeToA4();
}

function setPhoto(src) {
  if (!previewPhoto) return;
  if (!src) {
    previewPhoto.classList.add("hidden");
    previewPhoto.removeAttribute("src");
    return;
  }
  previewPhoto.src = src;
  previewPhoto.classList.remove("hidden");
}

const cropState = {
  image: null,
  scale: 1,
  baseScale: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  startX: 0,
  startY: 0
};

let pageMode = "single";

function updatePageModeButtons(canSwitch) {
  if (!singlePageBtn || !doublePageBtn) return;
  singlePageBtn.classList.toggle("active", pageMode === "single");
  doublePageBtn.classList.toggle("active", pageMode === "double");
  doublePageBtn.disabled = !canSwitch;
  if (!canSwitch) {
    pageMode = "single";
    singlePageBtn.classList.add("active");
    doublePageBtn.classList.remove("active");
  }
}

function getCanvasPoint(event) {
  if (!cropCanvas) return { x: 0, y: 0 };
  const rect = cropCanvas.getBoundingClientRect();
  const scaleX = cropCanvas.width / rect.width;
  const scaleY = cropCanvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function safeSavePhoto(outputCanvas) {
  const qualities = [0.9, 0.82, 0.74, 0.65];
  for (const quality of qualities) {
    const candidate = outputCanvas.toDataURL("image/jpeg", quality);
    try {
      localStorage.setItem(PHOTO_KEY, candidate);
      return candidate;
    } catch {
      // Try lower quality until it fits localStorage quota.
    }
  }
  const fallback = outputCanvas.toDataURL("image/jpeg", 0.6);
  try {
    localStorage.removeItem(PHOTO_KEY);
    localStorage.setItem(PHOTO_KEY, fallback);
  } catch {
    // If storage still fails, keep preview only in current session.
  }
  return fallback;
}

function clampCropOffsets() {
  if (!cropCanvas || !cropState.image) return;
  const cw = cropCanvas.width;
  const ch = cropCanvas.height;
  const drawW = cropState.image.width * cropState.baseScale * cropState.scale;
  const drawH = cropState.image.height * cropState.baseScale * cropState.scale;
  const minX = Math.min(0, cw - drawW);
  const minY = Math.min(0, ch - drawH);
  cropState.offsetX = Math.max(minX, Math.min(0, cropState.offsetX));
  cropState.offsetY = Math.max(minY, Math.min(0, cropState.offsetY));
}

function drawCropCanvas() {
  if (!cropCanvas || !cropState.image) return;
  const ctx = cropCanvas.getContext("2d");
  if (!ctx) return;
  const cw = cropCanvas.width;
  const ch = cropCanvas.height;
  ctx.clearRect(0, 0, cw, ch);
  const drawW = cropState.image.width * cropState.baseScale * cropState.scale;
  const drawH = cropState.image.height * cropState.baseScale * cropState.scale;
  clampCropOffsets();
  ctx.drawImage(cropState.image, cropState.offsetX, cropState.offsetY, drawW, drawH);
}

function openCropper(src) {
  if (!cropDialog || !cropCanvas || !cropZoom) return;
  const img = new Image();
  img.onload = () => {
    cropState.image = img;
    const cw = cropCanvas.width;
    const ch = cropCanvas.height;
    cropState.baseScale = Math.max(cw / img.width, ch / img.height);
    cropState.scale = 1;
    cropState.offsetX = (cw - img.width * cropState.baseScale) / 2;
    cropState.offsetY = (ch - img.height * cropState.baseScale) / 2;
    cropZoom.value = "1";
    drawCropCanvas();
    cropDialog.showModal();
  };
  img.src = src;
}

const demoData = {
  name: "李同学",
  title: "前端开发实习生",
  phone: "13800000000",
  email: "student@example.com",
  city: "杭州",
  link: "https://github.com/student-demo",
  summary:
    "熟悉 JavaScript 和 React，具备独立完成小型 Web 项目的能力，正在持续打磨工程化与调试能力。",
  education: "XX大学 计算机科学与技术 本科 2022.09 - 2026.06",
  projects:
    "简历生成器 | 个人项目 | 2026.04\n- 负责表单模块、实时预览和打印导出能力\n- 完成本地存储，支持刷新后恢复内容",
  skills: "JavaScript\nReact\nNode.js\nGit\nHTML/CSS"
};

// Export functions
function exportJSON() {
  const data = readFormData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "resume.json";
  a.click();
  URL.revokeObjectURL(url);
}

function exportMarkdown() {
  const data = readFormData();
  let md = `# ${data.name}\n\n`;
  md += `**${data.title}**\n\n`;
  md += buildContactText(data) + "\n\n";
  
  if (data.summary) {
    md += `## 个人简介\n${data.summary}\n\n`;
  }
  
  if (data.education) {
    md += `## 教育经历\n`;
    parseMultiLine(data.education).forEach(item => {
      md += `- ${item}\n`;
    });
    md += "\n";
  }
  
  if (data.projects) {
    md += `## 项目经历\n`;
    parseMultiLine(data.projects).forEach(item => {
      md += `- ${item}\n`;
    });
    md += "\n";
  }
  
  if (data.skills) {
    md += `## 技能清单\n`;
    parseMultiLine(data.skills).forEach(item => {
      md += `- ${item}\n`;
    });
  }
  
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "resume.md";
  a.click();
  URL.revokeObjectURL(url);
}

function exportTXT() {
  const data = readFormData();
  let txt = `${data.name}\n`;
  txt += `${data.title}\n`;
  txt += buildContactText(data) + "\n\n";
  
  if (data.summary) {
    txt += `个人简介\n${data.summary}\n\n`;
  }
  
  if (data.education) {
    txt += `教育经历\n`;
    parseMultiLine(data.education).forEach(item => {
      txt += `${item}\n`;
    });
    txt += "\n";
  }
  
  if (data.projects) {
    txt += `项目经历\n`;
    parseMultiLine(data.projects).forEach(item => {
      txt += `${item}\n`;
    });
    txt += "\n";
  }
  
  if (data.skills) {
    txt += `技能清单\n`;
    parseMultiLine(data.skills).forEach(item => {
      txt += `${item}\n`;
    });
  }
  
  const blob = new Blob([txt], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "resume.txt";
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON() {
  fileInput.click();
}

function handleFileImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      writeFormData(data);
      sync();
      alert("导入成功！");
    } catch (error) {
      alert("导入失败，文件格式不正确。");
    }
  };
  reader.readAsText(file);
  fileInput.value = "";
}

// Template functions
function setTemplate(template) {
  document.body.dataset.template = template;
  localStorage.setItem(TEMPLATE_KEY, template);
  
  const buttons = document.querySelectorAll(".template-btn");
  buttons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.template === template);
  });
}

resumeForm.addEventListener("input", sync);

printBtn.addEventListener("click", () => {
  sync();
  const element = document.getElementById("resumePreview");
  const opt = {
    margin: 0,
    filename: "resume.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };
  html2pdf().set(opt).from(element).save();
});

clearBtn.addEventListener("click", () => {
  resumeForm.reset();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PHOTO_KEY);
  if (photoInput) photoInput.value = "";
  setPhoto("");
  renderPreview({});
  fitResumeToA4();
});

loadDemoBtn.addEventListener("click", () => {
  writeFormData(demoData);
  sync();
});

exportJsonBtn?.addEventListener("click", exportJSON);
exportMdBtn?.addEventListener("click", exportMarkdown);
exportTxtBtn?.addEventListener("click", exportTXT);
importJsonBtn?.addEventListener("click", importJSON);
fileInput?.addEventListener("change", handleFileImport);

// Template button listeners
templateClassicBtn?.addEventListener("click", () => setTemplate("classic"));
templateModernBtn?.addEventListener("click", () => setTemplate("modern"));
templateMinimalBtn?.addEventListener("click", () => setTemplate("minimal"));
templateElegantBtn?.addEventListener("click", () => setTemplate("elegant"));

const initial = loadData();
if (initial) {
  writeFormData(initial);
  renderPreview(initial);
} else {
  renderPreview({});
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  if (themeToggleBtn) {
    themeToggleBtn.textContent =
      theme === "dark" ? "切换浅色模式" : "切换深色模式";
  }
}

const savedTheme = localStorage.getItem(THEME_KEY) || "light";
applyTheme(savedTheme);

const savedTemplate = localStorage.getItem(TEMPLATE_KEY) || "classic";
setTemplate(savedTemplate);

const savedPhoto = localStorage.getItem(PHOTO_KEY);
if (savedPhoto) {
  setPhoto(savedPhoto);
}

themeToggleBtn?.addEventListener("click", () => {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
});

function initParticles() {
  if (!particleCanvas) return;
  const ctx = particleCanvas.getContext("2d");
  if (!ctx) return;

  const particles = [];
  const baseCount = Math.min(34, Math.max(14, Math.floor(window.innerWidth / 48)));

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function resize() {
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
  }

  function createParticle() {
    return {
      x: random(0, particleCanvas.width),
      y: random(0, particleCanvas.height),
      r: random(1.2, 3.2),
      vx: random(-0.2, 0.2),
      vy: random(-0.25, 0.25),
      alpha: random(0.12, 0.32)
    };
  }

  function fillParticles() {
    particles.length = 0;
    for (let i = 0; i < baseCount; i += 1) {
      particles.push(createParticle());
    }
  }

  function draw() {
    ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -20) p.x = particleCanvas.width + 20;
      if (p.x > particleCanvas.width + 20) p.x = -20;
      if (p.y < -20) p.y = particleCanvas.height + 20;
      if (p.y > particleCanvas.height + 20) p.y = -20;

      const dark = document.body.dataset.theme === "dark";
      const color = dark
        ? `rgba(151, 187, 255, ${p.alpha})`
        : `rgba(84, 132, 255, ${p.alpha})`;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }

  resize();
  fillParticles();
  draw();
  window.addEventListener("resize", () => {
    resize();
    fillParticles();
  });
}

initParticles();

function fitResumeToA4() {
  if (!resumePreview) return;
  resumePreview.classList.remove("is-multipage");
  resumePreview.style.transform = "scale(1)";

  const targetHeight = resumePreview.clientHeight;
  const contentHeight = resumePreview.scrollHeight;
  if (!targetHeight || !contentHeight) return;

  const scale = Math.min(1, targetHeight / contentHeight);
  const needsShrink = scale < 1;
  updatePageModeButtons(needsShrink);

  if (needsShrink && pageMode === "double") {
    const a4PageHeight = resumePreview.offsetWidth * Math.SQRT2;
    const pageCount = Math.max(1, Math.ceil(contentHeight / a4PageHeight));
    resumePreview.classList.add("is-multipage");
    resumePreview.style.transform = "scale(1)";
    if (fitStatus) {
      fitStatus.textContent = `双页模式：约 ${pageCount} 页`;
      fitStatus.title = "内容超出单页，已按标准字号分页显示";
    }
    return;
  }

  const finalScale = Math.max(0.75, scale);
  resumePreview.style.transform = `scale(${finalScale})`;

  if (fitStatus) {
    const percent = Math.round(finalScale * 100);
    fitStatus.textContent = needsShrink ? `单页压缩：${percent}%` : `A4 适配：${percent}%`;
    fitStatus.title =
      needsShrink
        ? "标准字号已超出一页，可切换为双页保持可读性"
        : "当前内容可自然保持单页显示";
  }
}

window.addEventListener("resize", fitResumeToA4);
window.addEventListener("load", fitResumeToA4);

singlePageBtn?.addEventListener("click", () => {
  pageMode = "single";
  fitResumeToA4();
});

doublePageBtn?.addEventListener("click", () => {
  if (doublePageBtn.disabled) return;
  pageMode = "double";
  fitResumeToA4();
});

photoInput?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const src = typeof reader.result === "string" ? reader.result : "";
    if (!src) return;
    openCropper(src);
  };
  reader.readAsDataURL(file);
});

cropZoom?.addEventListener("input", () => {
  cropState.scale = Number(cropZoom.value || 1);
  drawCropCanvas();
});

cropCanvas?.addEventListener("pointerdown", (event) => {
  const point = getCanvasPoint(event);
  cropState.dragging = true;
  cropState.startX = point.x - cropState.offsetX;
  cropState.startY = point.y - cropState.offsetY;
  cropCanvas.setPointerCapture(event.pointerId);
});

cropCanvas?.addEventListener("pointermove", (event) => {
  if (!cropState.dragging) return;
  const point = getCanvasPoint(event);
  cropState.offsetX = point.x - cropState.startX;
  cropState.offsetY = point.y - cropState.startY;
  drawCropCanvas();
});

function stopDragging() {
  cropState.dragging = false;
}

cropCanvas?.addEventListener("pointerup", stopDragging);
cropCanvas?.addEventListener("pointercancel", stopDragging);

cancelCropBtn?.addEventListener("click", () => {
  cropDialog?.close();
  if (photoInput) {
    photoInput.value = "";
  }
});

applyCropBtn?.addEventListener("click", () => {
  if (!cropState.image || !cropCanvas) return;
  const out = document.createElement("canvas");
  out.width = 300;
  out.height = 400;
  const outCtx = out.getContext("2d");
  if (!outCtx) return;
  const drawW = cropState.image.width * cropState.baseScale * cropState.scale;
  const drawH = cropState.image.height * cropState.baseScale * cropState.scale;
  outCtx.drawImage(cropState.image, cropState.offsetX, cropState.offsetY, drawW, drawH);
  const finalPhoto = safeSavePhoto(out);
  setPhoto(finalPhoto);
  fitResumeToA4();
  cropDialog?.close();
});
