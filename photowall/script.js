const photoInput = document.getElementById("photoInput");
const messageInput = document.getElementById("messageInput");
const tileSizeRange = document.getElementById("tileSizeRange");
const tileSizeValue = document.getElementById("tileSizeValue");
const holdTimeRange = document.getElementById("holdTimeRange");
const holdTimeValue = document.getElementById("holdTimeValue");
const startButton = document.getElementById("startButton");
const resetButton = document.getElementById("resetButton");
const exportButton = document.getElementById("exportButton");
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
const segModeTabs = document.getElementById("segModeTabs");
const edgeSensitivityRange = document.getElementById("edgeSensitivityRange");
const edgeSensitivityValue = document.getElementById("edgeSensitivityValue");
const drawCanvas = document.getElementById("drawCanvas");
const drawCtx = drawCanvas.getContext("2d");
const brushSizeRange = document.getElementById("brushSizeRange");
const brushSizeValue = document.getElementById("brushSizeValue");
const eraserToggle = document.getElementById("eraserToggle");
const clearCanvasBtn = document.getElementById("clearCanvasBtn");

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
  segmentationMode: "luminance", // "luminance" | "subject"
  edgeSensitivity: 50,
  cachedSubjectMask: null,
  cachedMaskKey: "",
  brushSize: Number(brushSizeRange.value),
  isErasing: false,
  isDrawing: false,
  lastDrawX: 0,
  lastDrawY: 0,
  currentPoints: [],
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
  state.cachedSubjectMask = null;
  state.cachedMaskKey = "";
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

function updateEdgeSensitivityLabel() {
  edgeSensitivityValue.textContent = String(state.edgeSensitivity);
}

function updateBrushSizeLabel() {
  brushSizeValue.textContent = `${state.brushSize} px`;
}

// ---- drawing canvas ----

function initDrawingCanvas() {
  const rect = readStageRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);

  if (drawCanvas.width !== w || drawCanvas.height !== h) {
    // preserve existing drawing when resizing
    const oldData = drawCanvas.width > 0 ? drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height) : null;
    drawCanvas.width = w;
    drawCanvas.height = h;
    drawCtx.fillStyle = "#fff";
    drawCtx.fillRect(0, 0, w, h);
    if (oldData) {
      drawCtx.putImageData(oldData, 0, 0);
    }
  }
}

function clearDrawingCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = readStageRect();
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  drawCtx.fillStyle = "#fff";
  drawCtx.fillRect(0, 0, w, h);
}

function getDrawPoint(e) {
  const rect = drawCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    x: (e.clientX - rect.left) * dpr,
    y: (e.clientY - rect.top) * dpr,
  };
}

function startStroke(e) {
  e.preventDefault();
  state.isDrawing = true;
  const pt = getDrawPoint(e);
  state.lastDrawX = pt.x;
  state.lastDrawY = pt.y;

  drawCtx.lineWidth = state.brushSize * (window.devicePixelRatio || 1);
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  drawCtx.strokeStyle = state.isErasing ? "#fff" : "#111";
  drawCtx.globalCompositeOperation = "source-over";

  // draw a dot at the start point
  drawCtx.beginPath();
  drawCtx.arc(pt.x, pt.y, drawCtx.lineWidth / 2, 0, Math.PI * 2);
  drawCtx.fillStyle = drawCtx.strokeStyle;
  drawCtx.fill();
}

function continueStroke(e) {
  if (!state.isDrawing) return;
  e.preventDefault();
  const pt = getDrawPoint(e);

  drawCtx.lineWidth = state.brushSize * (window.devicePixelRatio || 1);
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  drawCtx.strokeStyle = state.isErasing ? "#fff" : "#111";
  drawCtx.globalCompositeOperation = "source-over";

  drawCtx.beginPath();
  drawCtx.moveTo(state.lastDrawX, state.lastDrawY);
  drawCtx.lineTo(pt.x, pt.y);
  drawCtx.stroke();

  state.lastDrawX = pt.x;
  state.lastDrawY = pt.y;
}

function endStroke(e) {
  if (!state.isDrawing) return;
  state.isDrawing = false;
  state.lastDrawX = 0;
  state.lastDrawY = 0;
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
  if (state.mode === "canvas") {
    drawCanvas.classList.remove("is-hidden");
  }

  // hide mosaic white background
  const bg = document.getElementById("glyph-bg");
  if (bg) bg.classList.add("is-hidden");
  state.currentPoints = [];

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

// ---- subject extraction pipeline ----

function getMaskCtx(w, h) {
  if (!getMaskCtx._canvas) {
    getMaskCtx._canvas = document.createElement("canvas");
    getMaskCtx._ctx = getMaskCtx._canvas.getContext("2d", { willReadFrequently: true });
  }
  var c = getMaskCtx._canvas;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return { ctx: getMaskCtx._ctx, w: w, h: h };
}

function boxBlur(gray, w, h, radius) {
  var tmp = new Float32Array(w * h);
  var out = new Float32Array(w * h);

  // horizontal
  for (var y = 0; y < h; y++) {
    var rowStart = y * w;
    for (var x = 0; x < w; x++) {
      var sum = 0;
      var count = 0;
      var x0 = Math.max(0, x - radius);
      var x1 = Math.min(w - 1, x + radius);
      for (var nx = x0; nx <= x1; nx++) {
        var v = gray[rowStart + nx];
        if (v >= 0) { sum += v; count++; }
      }
      tmp[rowStart + x] = count > 0 ? sum / count : 0;
    }
  }

  // vertical
  for (var y = 0; y < h; y++) {
    var rowStart = y * w;
    var y0 = Math.max(0, y - radius);
    var y1 = Math.min(h - 1, y + radius);
    for (var x = 0; x < w; x++) {
      var sum = 0;
      var count = 0;
      for (var ny = y0; ny <= y1; ny++) {
        var v = tmp[ny * w + x];
        if (v >= 0) { sum += v; count++; }
      }
      out[rowStart + x] = count > 0 ? sum / count : 0;
    }
  }

  return out;
}

function sobelEdges(gray, w, h) {
  var out = new Float32Array(w * h);
  var maxVal = 0;

  for (var y = 1; y < h - 1; y++) {
    var row = y * w;
    var rowUp = (y - 1) * w;
    var rowDown = (y + 1) * w;
    for (var x = 1; x < w - 1; x++) {
      var gx = -gray[rowUp + x - 1]   + gray[rowUp + x + 1]
               -2 * gray[row + x - 1]  + 2 * gray[row + x + 1]
               -gray[rowDown + x - 1]  + gray[rowDown + x + 1];
      var gy = -gray[rowUp + x - 1]   -2 * gray[rowUp + x]   -gray[rowUp + x + 1]
               +gray[rowDown + x - 1] +2 * gray[rowDown + x] +gray[rowDown + x + 1];
      var mag = Math.sqrt(gx * gx + gy * gy);
      out[row + x] = mag;
      if (mag > maxVal) maxVal = mag;
    }
  }

  // normalize to 0-255
  if (maxVal > 0) {
    for (var i = 0; i < out.length; i++) {
      out[i] = (out[i] / maxVal) * 255;
    }
  }

  return out;
}

function dilate(mask, w, h, radius) {
  var out = new Uint8Array(w * h);

  for (var y = 0; y < h; y++) {
    var rowStart = y * w;
    var y0 = Math.max(0, y - radius);
    var y1 = Math.min(h - 1, y + radius);
    for (var x = 0; x < w; x++) {
      var found = false;
      for (var ny = y0; ny <= y1 && !found; ny++) {
        var nRow = ny * w;
        var x0 = Math.max(0, x - radius);
        var x1 = Math.min(w - 1, x + radius);
        for (var nx = x0; nx <= x1; nx++) {
          if (mask[nRow + nx]) { found = true; break; }
        }
      }
      out[rowStart + x] = found ? 1 : 0;
    }
  }
  return out;
}

function floodFillEdges(barrier, w, h, gray) {
  var visited = new Uint8Array(w * h);
  var queue = [];
  var qHead = 0;

  // seed from all 4 edges, skipping barrier pixels
  for (var x = 0; x < w; x++) {
    if (gray[x] >= 0 && !barrier[x]) { queue.push(x, 0); visited[x] = 1; }
    var btm = (h - 1) * w + x;
    if (gray[btm] >= 0 && !barrier[btm]) { queue.push(btm, h - 1); visited[btm] = 1; }
  }
  for (var y = 1; y < h - 1; y++) {
    var left = y * w;
    if (gray[left] >= 0 && !barrier[left]) { queue.push(left, y); visited[left] = 1; }
    var right = y * w + w - 1;
    if (gray[right] >= 0 && !barrier[right]) { queue.push(right, y); visited[right] = 1; }
  }

  while (qHead < queue.length) {
    var idx = queue[qHead++];
    var cy = queue[qHead++];
    var cx = idx - cy * w;
    var rowStart = cy * w;

    var neighbors = [
      cx > 0 ? rowStart + cx - 1 : -1,
      cx < w - 1 ? rowStart + cx + 1 : -1,
      cy > 0 ? rowStart - w + cx : -1,
      cy < h - 1 ? rowStart + w + cx : -1,
    ];

    for (var n = 0; n < 4; n++) {
      var ni = neighbors[n];
      if (ni >= 0 && !visited[ni] && !barrier[ni] && gray[ni] >= 0) {
        visited[ni] = 1;
        var ny = Math.floor(ni / w);
        queue.push(ni, ny);
      }
    }
  }

  return visited; // 1 = reachable from edge (background)
}

function keepLargestComponent(mask, w, h) {
  var labels = new Int32Array(w * h);
  labels.fill(-1);
  var sizes = [];
  var eq = []; // union-find equivalence table

  function findRoot(a) {
    while (eq[a] !== a) { a = eq[a]; }
    return a;
  }

  // first pass: label
  var nextLabel = 0;
  for (var y = 0; y < h; y++) {
    var row = y * w;
    for (var x = 0; x < w; x++) {
      if (!mask[row + x]) continue;

      var above = y > 0 ? labels[row - w + x] : -1;
      var left = x > 0 ? labels[row + x - 1] : -1;

      if (above < 0 && left < 0) {
        labels[row + x] = nextLabel;
        eq[nextLabel] = nextLabel;
        sizes[nextLabel] = 1;
        nextLabel++;
      } else if (above >= 0 && left < 0) {
        var root = findRoot(above);
        labels[row + x] = root;
        sizes[root]++;
      } else if (above < 0 && left >= 0) {
        var root = findRoot(left);
        labels[row + x] = root;
        sizes[root]++;
      } else {
        var rAbove = findRoot(above);
        var rLeft = findRoot(left);
        if (rAbove === rLeft) {
          labels[row + x] = rAbove;
          sizes[rAbove]++;
        } else {
          // merge smaller into larger
          if (sizes[rAbove] >= sizes[rLeft]) {
            eq[rLeft] = rAbove;
            labels[row + x] = rAbove;
            sizes[rAbove] += sizes[rLeft] + 1;
          } else {
            eq[rAbove] = rLeft;
            labels[row + x] = rLeft;
            sizes[rLeft] += sizes[rAbove] + 1;
          }
        }
      }
    }
  }

  // find largest
  var largestRoot = -1;
  var largestSize = 0;
  for (var i = 0; i < nextLabel; i++) {
    if (eq[i] === i && sizes[i] > largestSize) {
      largestSize = sizes[i];
      largestRoot = i;
    }
  }

  // second pass: keep only largest
  var out = new Uint8Array(w * h);
  for (var i = 0; i < labels.length; i++) {
    if (labels[i] >= 0 && findRoot(labels[i]) === largestRoot) {
      out[i] = 1;
    }
  }
  return out;
}

function computeSubjectMask(imageElement, rect) {
  var w = Math.round(rect.width);
  var h = Math.round(rect.height);

  var mc = getMaskCtx(w, h);
  mc.ctx.clearRect(0, 0, w, h);

  // fit image to stage preserving aspect ratio
  var imgAspect = imageElement.naturalWidth / imageElement.naturalHeight;
  var stageAspect = rect.width / rect.height;
  var dw, dh;
  if (imgAspect > stageAspect) {
    dw = rect.width * 0.85;
    dh = dw / imgAspect;
  } else {
    dh = rect.height * 0.85;
    dw = dh * imgAspect;
  }
  var dx = (rect.width - dw) / 2;
  var dy = (rect.height - dh) / 2;

  mc.ctx.drawImage(imageElement, dx, dy, dw, dh);
  var imgData = mc.ctx.getImageData(0, 0, w, h);
  var data = imgData.data;
  var len = w * h;

  // convert to grayscale
  var gray = new Float32Array(len);
  for (var i = 0; i < len; i++) {
    var j = i * 4;
    if (data[j + 3] < 80) {
      gray[i] = -1;
    } else {
      gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    }
  }

  // blur to reduce noise
  var blurred = boxBlur(gray, w, h, 2);

  // edge detection
  var edges = sobelEdges(blurred, w, h);

  // threshold edges based on sensitivity
  var sensitivity = state.edgeSensitivity / 100; // 0..1
  var edgeThresh = 5 + (1 - sensitivity) * 95; // 5..100
  var edgeMask = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    edgeMask[i] = edges[i] > edgeThresh ? 1 : 0;
  }

  // dilate edges to create flood-fill barriers
  var dilated = dilate(edgeMask, w, h, 2);

  // set outermost border as barrier to prevent leaks
  for (var x = 0; x < w; x++) { dilated[x] = 1; dilated[(h - 1) * w + x] = 1; }
  for (var y = 1; y < h - 1; y++) { dilated[y * w] = 1; dilated[y * w + w - 1] = 1; }

  // flood fill from edges (what's reachable = background)
  var bgMask = floodFillEdges(dilated, w, h, gray);

  // foreground = not reached by flood fill, not transparent, not barrier
  var fgMask = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    fgMask[i] = (gray[i] >= 0 && !bgMask[i] && !dilated[i]) ? 1 : 0;
  }

  // keep only the largest connected foreground region
  return keepLargestComponent(fgMask, w, h);
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

  // Compute or retrieve subject mask when in subject mode
  let subjectMask = null;
  let maskW = 0;
  let maskH = 0;
  if (state.segmentationMode === "subject") {
    const maskKey = `${imageElement.src}-${Math.round(rect.width)}-${Math.round(rect.height)}-${state.edgeSensitivity}`;
    if (!state.cachedSubjectMask || state.cachedMaskKey !== maskKey) {
      state.cachedSubjectMask = computeSubjectMask(imageElement, rect);
      state.cachedMaskKey = maskKey;
    }
    subjectMask = state.cachedSubjectMask;
    maskW = Math.round(rect.width);
    maskH = Math.round(rect.height);
  }

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
      const a = imageData[index + 3];

      // skip transparent areas outside the drawn image
      if (a < 80) continue;

      let fill;
      if (subjectMask) {
        // sample subject mask at tile center (stage coordinates)
        const mx = Math.min(maskW - 1, Math.round(x + tileSize * 0.5));
        const my = Math.min(maskH - 1, Math.round(y + tileSize * 0.5));
        const maskVal = subjectMask[my * maskW + mx];
        fill = state.invertFill ? (maskVal === 1) : (maskVal === 0);
      } else {
        const r = imageData[index];
        const g = imageData[index + 1];
        const b = imageData[index + 2];
        const luminance = computeLuminance(r, g, b);
        fill = state.invertFill
          ? luminance < threshold
          : luminance >= threshold;
      }

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

  state.currentPoints = points;

  ensureTileCount(points.length);

  // create or update white background behind the mosaic
  let bg = document.getElementById("glyph-bg");
  if (!bg) {
    bg = document.createElement("div");
    bg.id = "glyph-bg";
    bg.className = "glyph-bg";
    stage.insertBefore(bg, stage.firstChild);
  }

  if (points.length) {
    const bounds = points.reduce(
      (acc, p) => ({
        minX: Math.min(acc.minX, p.x),
        maxX: Math.max(acc.maxX, p.x),
        minY: Math.min(acc.minY, p.y),
        maxY: Math.max(acc.maxY, p.y),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      }
    );
    const pad = state.tileSize * 2;
    bg.style.left = (bounds.minX - pad) + "px";
    bg.style.top = (bounds.minY - pad) + "px";
    bg.style.width = (bounds.maxX - bounds.minX + state.tileSize + pad * 2) + "px";
    bg.style.height = (bounds.maxY - bounds.minY + state.tileSize + pad * 2) + "px";
    bg.classList.remove("is-hidden");
  } else {
    bg.classList.add("is-hidden");
  }

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
      if (state.segmentationMode === "subject") {
        setStatus("未提取到主体区域，尝试调整边缘灵敏度或切换到亮度阈值模式。");
      } else {
        setStatus("当前阈值下没有匹配到任何采样点，尝试调整阈值或反转填充方向。");
      }
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

// ---- canvas mode ----

async function playCanvas() {
  try {
    if (!state.photos.length) {
      setStatus("还没有照片，先上传一组图片吧。");
      return;
    }

    removeEmptyState();
    const token = Date.now();
    state.animationToken = token;
    startButton.disabled = true;
    setStatus("正在用照片拼接画稿...");

    // convert drawing canvas to an image, then use buildImagePoints
    const dataUrl = drawCanvas.toDataURL("image/png");
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const prevSegMode = state.segmentationMode;
    state.segmentationMode = "luminance";
    let points;
    try {
      points = buildImagePoints(img);
    } finally {
      state.segmentationMode = prevSegMode;
    }

    if (!points.length) {
      setStatus("画板上没有检测到任何笔迹，请先在画布上绘制后再试。");
      startButton.disabled = false;
      return;
    }

    // hide drawing canvas so the mosaic tiles are visible
    drawCanvas.classList.add("is-hidden");

    showGlyph(points, token);

    if (state.animationToken === token) {
      setStatus(`拼接完成，共使用 ${points.length} 个照片格子。`);
    }

    startButton.disabled = false;
  } catch (err) {
    console.error("playCanvas error:", err);
    setStatus("拼接出错: " + (err.message || "未知错误"));
    startButton.disabled = false;
  }
}

// ---- export ----

async function exportMosaic() {
  if (!state.currentPoints.length) {
    setStatus("没有可导出的拼接结果，请先执行一次拼接。");
    return;
  }

  const points = state.currentPoints;
  const tileSize = state.tileSize;
  const exportScale = Math.max(2, Math.round(100 / tileSize));
  const pad = tileSize * 2;

  // compute bounds
  const bounds = points.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      maxX: Math.max(acc.maxX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxY: Math.max(acc.maxY, p.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );

  const canvasWidth = (bounds.maxX - bounds.minX + tileSize + pad * 2) * exportScale;
  const canvasHeight = (bounds.maxY - bounds.minY + tileSize + pad * 2) * exportScale;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  // white background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  setStatus("正在导出，加载照片中...");

  // load all unique photos as Image objects
  const loadedImages = [];
  for (let i = 0; i < state.photos.length; i++) {
    const img = new Image();
    img.src = state.photos[i].url;
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error(`照片 ${i + 1} 加载失败`));
      });
    } catch (e) {
      // skip failed images, draw nothing for them
    }
    loadedImages.push(img);
  }

  if (!loadedImages.length) {
    setStatus("导出失败：没有可用的照片。");
    return;
  }

  // draw each tile
  const offsetX = bounds.minX - pad;
  const offsetY = bounds.minY - pad;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const img = loadedImages[i % loadedImages.length];
    if (!img || !img.naturalWidth) continue;
    const x = (point.x - offsetX) * exportScale;
    const y = (point.y - offsetY) * exportScale;
    const size = point.size * exportScale;
    ctx.drawImage(img, x, y, size, size);
  }

  // trigger download
  canvas.toBlob((blob) => {
    if (!blob) {
      setStatus("导出失败：无法生成图片。");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "photowall-" + Date.now() + ".png";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`导出完成，图片 ${canvas.width}×${canvas.height} px，可直接打印。`);
  }, "image/png");
}

// ---- mode switching ----

function switchMode(mode) {
  state.mode = mode;

  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.mode === mode);
  });

  const textControls = document.querySelectorAll(".mode-text");
  const imageControls = document.querySelectorAll(".mode-image");
  const canvasControls = document.querySelectorAll(".mode-canvas");

  textControls.forEach((el) => el.classList.toggle("is-hidden", mode !== "text"));
  imageControls.forEach((el) => el.classList.toggle("is-hidden", mode !== "image"));
  canvasControls.forEach((el) => el.classList.toggle("is-hidden", mode !== "canvas"));

  // show/hide drawing canvas overlay
  drawCanvas.classList.toggle("is-hidden", mode !== "canvas");

  // sync segmentation sub-mode visibility
  if (mode === "image") {
    updateSegControlsVisibility();
  }

  // init drawing canvas when entering canvas mode
  if (mode === "canvas") {
    initDrawingCanvas();
  }

  cancelAnimation();
  layoutGrid();
}

function switchSegMode(segMode) {
  state.segmentationMode = segMode;
  state.cachedSubjectMask = null;
  state.cachedMaskKey = "";

  document.querySelectorAll("#segModeTabs .mode-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.seg === segMode);
  });

  updateSegControlsVisibility();
}

function updateSegControlsVisibility() {
  const isSubject = state.segmentationMode === "subject";
  document.querySelectorAll(".seg-luminance").forEach((el) => el.classList.toggle("is-hidden", isSubject));
  document.querySelectorAll(".seg-subject").forEach((el) => el.classList.toggle("is-hidden", !isSubject));
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

segModeTabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".mode-tab");
  if (!tab) return;
  switchSegMode(tab.dataset.seg);
});

edgeSensitivityRange.addEventListener("input", () => {
  state.edgeSensitivity = Number(edgeSensitivityRange.value);
  state.cachedSubjectMask = null;
  state.cachedMaskKey = "";
  updateEdgeSensitivityLabel();
});

// ---- drawing canvas events ----

drawCanvas.addEventListener("pointerdown", startStroke);
drawCanvas.addEventListener("pointermove", continueStroke);
drawCanvas.addEventListener("pointerup", endStroke);
drawCanvas.addEventListener("pointerleave", endStroke);
drawCanvas.addEventListener("pointercancel", endStroke);

brushSizeRange.addEventListener("input", () => {
  state.brushSize = Number(brushSizeRange.value);
  updateBrushSizeLabel();
});

eraserToggle.addEventListener("click", () => {
  state.isErasing = !state.isErasing;
  eraserToggle.classList.toggle("is-active", state.isErasing);
  eraserToggle.textContent = state.isErasing ? "橡皮擦 (开)" : "橡皮擦";
});

clearCanvasBtn.addEventListener("click", () => {
  clearDrawingCanvas();
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
  } else if (state.mode === "canvas") {
    playCanvas();
  } else {
    playMessage();
  }
});

resetButton.addEventListener("click", () => {
  cancelAnimation();
  layoutGrid();
});

exportButton.addEventListener("click", () => {
  exportMosaic();
});

modeTabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".mode-tab");
  if (!tab) return;
  switchMode(tab.dataset.mode);
});

window.addEventListener("resize", () => {
  cancelAnimation();
  if (state.mode === "canvas") {
    initDrawingCanvas();
  }
  layoutGrid();
});

// ---- init ----

updateTileSizeLabel();
updateHoldTimeLabel();
updateThresholdLabel();
updateEdgeSensitivityLabel();
updateBrushSizeLabel();
createEmptyState();
