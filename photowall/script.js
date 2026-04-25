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

const state = {
  photos: [],
  tiles: [],
  gridSlots: [],
  animationToken: 0,
  tileSize: Number(tileSizeRange.value),
  holdSeconds: Number(holdTimeRange.value),
  emptyStateNode: null,
};

function createEmptyState() {
  if (state.emptyStateNode) {
    return;
  }

  const box = document.createElement("div");
  box.className = "empty-state";
  box.innerHTML = "<div><strong>等待照片中</strong><span>上传一组图片后，这里会先按行列展示，再切换成文字动画。</span></div>";
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
    setStatus(`正在显示“${glyph.character}” (${index + 1}/${glyphs.length})`);
    await sleep(state.holdSeconds * 1000);
  }

  if (state.animationToken === token) {
    setStatus("文字播放完成，已停留在最后一个字。");
  }

  startButton.disabled = false;
}

function cancelAnimation() {
  state.animationToken += 1;
  startButton.disabled = false;
}

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

startButton.addEventListener("click", () => {
  cancelAnimation();
  playMessage();
});

resetButton.addEventListener("click", () => {
  cancelAnimation();
  layoutGrid();
});

window.addEventListener("resize", () => {
  cancelAnimation();
  layoutGrid();
});

updateTileSizeLabel();
updateHoldTimeLabel();
createEmptyState();
