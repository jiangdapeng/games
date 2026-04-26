const photoInput = document.getElementById("photoInput");
const messageInput = document.getElementById("messageInput");
const tileSizeRange = document.getElementById("tileSizeRange");
const tileSizeValue = document.getElementById("tileSizeValue");
const holdTimeRange = document.getElementById("holdTimeRange");
const holdTimeValue = document.getElementById("holdTimeValue");
const startButton = document.getElementById("startButton");
const resetButton = document.getElementById("resetButton");
const statusText = document.getElementById("statusText");
const photoCount = document.getElementById("photoCount");
const stage = document.getElementById("stage");
const glyphCanvas = document.getElementById("glyphCanvas");
const glyphCtx = glyphCanvas.getContext("2d", { willReadFrequently: true });
const modeTabs = document.getElementById("modeTabs");
const refImageInput = document.getElementById("refImageInput");
const thresholdRange = document.getElementById("thresholdRange");
const thresholdValue = document.getElementById("thresholdValue");
const invertFillCheckbox = document.getElementById("invertFillCheckbox");

const state = {
  photos: [],
  tiles: [],
  gridSlots: [],
  animationToken: 0,
  tileSize: Number(tileSizeRange.value),
  holdSeconds: Number(holdTimeRange.value),
  mode: "text",
  refImage: null,
  refImageUrl: null,
  luminanceThreshold: Number(thresholdRange.value),
  invertFill: true,
  emptyStateNode: null,
};

function createEmptyState() {
  if (state.emptyStateNode) {
    return;
  }

  const box = document.createElement("div");
  box.className = "empty-state";
  box.innerHTML = "<div><strong>等待照片中</strong><span>上传一组图片后，这里会先按行列展示，再切换成拼接动画。</span></div>";
  state.emptyStateNode = box;
  stage.appendChild(box);
}

function removeEmptyState() {
  if (!state.emptyStateNode) {
    return;
  }

  state.emptyStateNode.remove();
  state.emptyStateNode = null;
}

function setStatus(text) {
  statusText.textContent = text;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function revokePhotos() {
  state.photos.forEach((photo) => URL.revokeObjectURL(photo.url));
}

function revokeRefImage() {
  if (state.refImageUrl) {
    URL.revokeObjectURL(state.refImageUrl);
    state.refImageUrl = null;
  }
  state.refImage = null;
}

function clearTiles() {
  state.tiles.forEach((tile) => tile.remove());
  state.tiles = [];
}

function normalizeMessage(text) {
  return Array.from(text.replace(/\s+/g, "").trim());
}

function updateTileSizeLabel() {
  tileSizeValue.textContent = `${state.tileSize} px`;
}

function updateHoldTimeLabel() {
  holdTimeValue.textContent = `${state.holdSeconds.toFixed(1)} 秒`;
}

function updateThresholdLabel() {
  thresholdValue.textContent = String(state.luminanceThreshold);
}

function readStageRect() {
  return stage.getBoundingClientRect();
}

function buildGridSlots() {
  const rect = readStageRect();
  const tileSize = state.tileSize;
  const gap = Math.max(6, Math.round(tileSize * 0.16));
  const columns = Math.max(1, Math.floor((rect.width - gap) / (tileSize + gap)));
  const slots = [];

  for (let index = 0; index < state.photos.length; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gap + column * (tileSize + gap);
    const y = gap + row * (tileSize + gap);

    slots.push({
      x,
      y,
      size: tileSize,
    });
  }

  state.gridSlots = slots;
}

function ensureTileCount(count) {
  while (state.tiles.length < count) {
    const tile = document.createElement("div");
    tile.className = "photo-tile is-grid";
    stage.appendChild(tile);
    state.tiles.push(tile);
  }
}

function applyTileVisual(tile, spec, imageUrl) {
  tile.style.width = `${spec.size}px`;
  tile.style.height = `${spec.size}px`;
  tile.style.transform = `translate(${Math.round(spec.x)}px, ${Math.round(spec.y)}px)`;
  tile.style.backgroundImage = `url("${imageUrl}")`;
}

function layoutGrid() {
  if (!state.photos.length) {
    clearTiles();
    createEmptyState();
    return;
  }

  removeEmptyState();
  buildGridSlots();
  ensureTileCount(state.photos.length);

  state.tiles.forEach((tile, index) => {
    const photo = state.photos[index % state.photos.length];
    const slot = state.gridSlots[index];

    if (!slot) {
      tile.classList.add("is-hidden");
      tile.classList.remove("is-grid", "is-glyph");
      return;
    }

    tile.classList.remove("is-hidden", "is-glyph");
    tile.classList.add("is-grid");
    applyTileVisual(tile, slot, photo.url);
  });

  photoCount.textContent = String(state.photos.length);
  setStatus(`已载入 ${state.photos.length} 张照片，当前是传统网格预览。`);
}

function loadPhotos(files) {
  revokePhotos();
  clearTiles();

  state.photos = Array.from(files).map((file, index) => ({
    id: `${file.name}-${index}-${file.lastModified}`,
    url: URL.createObjectURL(file),
  }));

  photoCount.textContent = String(state.photos.length);
  layoutGrid();
}

function computeFontSize(rect) {
  const widthLimited = rect.width * 0.72;
  const heightLimited = rect.height * 0.72;
  return Math.max(140, Math.min(widthLimited, heightLimited));
}

// ---- text mode: sample alpha channel from rendered character ----

function buildGlyphPoints(character) {
  const rect = readStageRect();
  const dpr = window.devicePixelRatio || 1;
  const tileSize = state.tileSize;
  const sampleGap = Math.max(2, Math.round(tileSize * 0.2));
  const step = tileSize + sampleGap;
  const fontSize = computeFontSize(rect);
  const canvasWidth = Math.max(1, Math.round(rect.width * dpr));
  const canvasHeight = Math.max(1, Math.round(rect.height * dpr));

  if (glyphCanvas.width !== canvasWidth || glyphCanvas.height !== canvasHeight) {
    glyphCanvas.width = canvasWidth;
    glyphCanvas.height = canvasHeight;
  }

  glyphCtx.setTransform(1, 0, 0, 1, 0, 0);
  glyphCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  glyphCtx.scale(dpr, dpr);
  glyphCtx.fillStyle = "#111";
  glyphCtx.textAlign = "center";
  glyphCtx.textBaseline = "middle";
  glyphCtx.font = `700 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  glyphCtx.fillText(character, rect.width / 2, rect.height / 2);

  const imageData = glyphCtx.getImageData(0, 0, canvasWidth, canvasHeight).data;
  const points = [];

  for (let y = 0; y <= rect.height - tileSize; y += step) {
    for (let x = 0; x <= rect.width - tileSize; x += step) {
      const sampleX = Math.min(canvasWidth - 1, Math.round((x + tileSize * 0.5) * dpr));
      const sampleY = Math.min(canvasHeight - 1, Math.round((y + tileSize * 0.5) * dpr));
      const alphaIndex = (sampleY * canvasWidth + sampleX) * 4 + 3;

      if (imageData[alphaIndex] > 80) {
        points.push({
          x,
          y,
          size: tileSize,
        });
      }
    }
  }

  const bounds = points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );

  if (!points.length) {
    return [];
  }

  const glyphWidth = bounds.maxX - bounds.minX + tileSize;
  const glyphHeight = bounds.maxY - bounds.minY + tileSize;
  const offsetX = (rect.width - glyphWidth) / 2 - bounds.minX;
  const offsetY = (rect.height - glyphHeight) / 2 - bounds.minY;

  return points.map((point) => ({
    x: point.x + offsetX,
    y: point.y + offsetY,
    size: point.size,
  }));
}

// ---- image mode: sample luminance from reference image ----

function computeLuminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function buildImagePoints(imageElement) {
  const rect = readStageRect();
  const dpr = window.devicePixelRatio || 1;
  const tileSize = state.tileSize;
  const sampleGap = Math.max(2, Math.round(tileSize * 0.2));
  const step = tileSize + sampleGap;
  const canvasWidth = Math.max(1, Math.round(rect.width * dpr));
  const canvasHeight = Math.max(1, Math.round(rect.height * dpr));
  const threshold = state.luminanceThreshold;

  if (glyphCanvas.width !== canvasWidth || glyphCanvas.height !== canvasHeight) {
    glyphCanvas.width = canvasWidth;
    glyphCanvas.height = canvasHeight;
  }

  glyphCtx.setTransform(1, 0, 0, 1, 0, 0);
  glyphCtx.clearRect(0, 0, canvasWidth, canvasHeight);

  // fit image to stage while preserving aspect ratio
  const imgAspect = imageElement.naturalWidth / imageElement.naturalHeight;
  const stageAspect = rect.width / rect.height;
  let drawWidth, drawHeight;

  if (imgAspect > stageAspect) {
    drawWidth = rect.width * 0.85;
    drawHeight = drawWidth / imgAspect;
  } else {
    drawHeight = rect.height * 0.85;
    drawWidth = drawHeight * imgAspect;
  }

  const drawX = (rect.width - drawWidth) / 2;
  const drawY = (rect.height - drawHeight) / 2;

  glyphCtx.scale(dpr, dpr);
  glyphCtx.drawImage(imageElement, drawX, drawY, drawWidth, drawHeight);

  const imageData = glyphCtx.getImageData(0, 0, canvasWidth, canvasHeight).data;
  const points = [];

  for (let y = 0; y <= rect.height - tileSize; y += step) {
    for (let x = 0; x <= rect.width - tileSize; x += step) {
      const sampleX = Math.min(canvasWidth - 1, Math.round((x + tileSize * 0.5) * dpr));
      const sampleY = Math.min(canvasHeight - 1, Math.round((y + tileSize * 0.5) * dpr));
      const index = (sampleY * canvasWidth + sampleX) * 4;
      const r = imageData[index];
      const g = imageData[index + 1];
      const b = imageData[index + 2];
      const a = imageData[index + 3];

      // skip transparent areas outside the drawn image
      if (a < 80) continue;

      const luminance = computeLuminance(r, g, b);

      const fill = state.invertFill
        ? luminance < threshold
        : luminance >= threshold;

      if (fill) {
        points.push({
          x,
          y,
          size: tileSize,
        });
      }
    }
  }

  const bounds = points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );

  if (!points.length) {
    return [];
  }

  const glyphWidth = bounds.maxX - bounds.minX + tileSize;
  const glyphHeight = bounds.maxY - bounds.minY + tileSize;
  const offsetX = (rect.width - glyphWidth) / 2 - bounds.minX;
  const offsetY = (rect.height - glyphHeight) / 2 - bounds.minY;

  return points.map((point) => ({
    x: point.x + offsetX,
    y: point.y + offsetY,
    size: point.size,
  }));
}

// ---- shared display ----

function showGlyph(points, token) {
  if (token !== state.animationToken) {
    return;
  }

  ensureTileCount(points.length);

  state.tiles.forEach((tile, index) => {
    const point = points[index];

    if (!point) {
      tile.classList.add("is-hidden");
      tile.classList.remove("is-grid", "is-glyph");
      return;
    }

    const photo = state.photos[index % state.photos.length];
    tile.classList.remove("is-hidden", "is-grid");
    tile.classList.add("is-glyph");
    applyTileVisual(tile, point, photo.url);
  });
}

// ---- text mode animation ----

async function playMessage() {
  const messageChars = normalizeMessage(messageInput.value);

  if (!state.photos.length) {
    setStatus("还没有照片，先上传一组图片吧。");
    return;
  }

  if (!messageChars.length) {
    setStatus("请输入要展示的文字。");
    return;
  }

  removeEmptyState();
  const token = Date.now();
  state.animationToken = token;
  startButton.disabled = true;
  setStatus(`开始播放，共 ${messageChars.length} 个字。`);

  const glyphs = messageChars.map((character) => ({
    character,
    points: buildGlyphPoints(character),
  }));

  const maxCount = glyphs.reduce((max, glyph) => Math.max(max, glyph.points.length), 0);
  ensureTileCount(maxCount);

  for (let index = 0; index < glyphs.length; index += 1) {
    if (state.animationToken !== token) {
      return;
    }

    const glyph = glyphs[index];
    showGlyph(glyph.points, token);
    setStatus(`正在显示"${glyph.character}" (${index + 1}/${glyphs.length})`);
    await sleep(state.holdSeconds * 1000);
  }

  if (state.animationToken === token) {
    setStatus("文字播放完成，已停留在最后一个字。");
  }

  startButton.disabled = false;
}

// ---- image mode animation ----

async function playImage() {
  try {
    if (!state.photos.length) {
      setStatus("还没有照片，先上传一组图片吧。");
      return;
    }

    if (!state.refImage) {
      setStatus("请先上传一张参考图。");
      return;
    }

    if (!state.refImage.naturalWidth || !state.refImage.naturalHeight) {
      setStatus("参考图尚未加载完成，请稍候再试。");
      return;
    }

    removeEmptyState();
    const token = Date.now();
    state.animationToken = token;
    startButton.disabled = true;
    setStatus("正在用照片拼接参考图...");

    const points = buildImagePoints(state.refImage);

    if (!points.length) {
      setStatus("当前阈值下没有匹配到任何采样点，尝试调整阈值或反转填充方向。");
      startButton.disabled = false;
      return;
    }

    showGlyph(points, token);

    if (state.animationToken === token) {
      setStatus(`拼接完成，共使用 ${points.length} 个照片格子。`);
    }

    startButton.disabled = false;
  } catch (err) {
    console.error("playImage error:", err);
    setStatus("拼接出错: " + (err.message || "未知错误"));
    startButton.disabled = false;
  }
}

// ---- mode switching ----

function switchMode(mode) {
  state.mode = mode;

  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.mode === mode);
  });

  const textControls = document.querySelectorAll(".mode-text");
  const imageControls = document.querySelectorAll(".mode-image");

  textControls.forEach((el) => el.classList.toggle("is-hidden", mode !== "text"));
  imageControls.forEach((el) => el.classList.toggle("is-hidden", mode !== "image"));

  cancelAnimation();
  layoutGrid();
}

// ---- animation control ----

function cancelAnimation() {
  state.animationToken += 1;
  startButton.disabled = false;
}

// ---- load reference image ----

function loadRefImage(file) {
  revokeRefImage();

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    state.refImage = img;
    state.refImageUrl = url;
    setStatus(`已载入参考图（${img.naturalWidth}×${img.naturalHeight}），可点击开始拼接。`);
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("参考图加载失败，请重试。");
  };

  img.src = url;
}

// ---- event listeners ----

photoInput.addEventListener("change", (event) => {
  loadPhotos(event.target.files || []);
});

tileSizeRange.addEventListener("input", () => {
  state.tileSize = Number(tileSizeRange.value);
  updateTileSizeLabel();
  cancelAnimation();
  layoutGrid();
});

holdTimeRange.addEventListener("input", () => {
  state.holdSeconds = Number(holdTimeRange.value);
  updateHoldTimeLabel();
});

thresholdRange.addEventListener("input", () => {
  state.luminanceThreshold = Number(thresholdRange.value);
  updateThresholdLabel();
});

invertFillCheckbox.addEventListener("change", () => {
  state.invertFill = invertFillCheckbox.checked;
});

refImageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) {
    loadRefImage(file);
  }
});

startButton.addEventListener("click", () => {
  cancelAnimation();
  if (state.mode === "image") {
    playImage();
  } else {
    playMessage();
  }
});

resetButton.addEventListener("click", () => {
  cancelAnimation();
  layoutGrid();
});

modeTabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".mode-tab");
  if (!tab) return;
  switchMode(tab.dataset.mode);
});

window.addEventListener("resize", () => {
  cancelAnimation();
  layoutGrid();
});

// ---- init ----

updateTileSizeLabel();
updateHoldTimeLabel();
updateThresholdLabel();
createEmptyState();
