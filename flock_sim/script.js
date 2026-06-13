const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");

const controls = {
  count: bindRange("count", 180, 0),
  separation: bindRange("separation", 1.45, 2),
  alignment: bindRange("alignment", 1.0, 2),
  cohesion: bindRange("cohesion", 0.82, 2),
  target: bindRange("target", 0.38, 2),
  perception: bindRange("perception", 72, 0),
  avoid: bindRange("avoid", 28, 0),
  speed: bindRange("speed", 3.2, 1),
  turn: bindRange("turn", 0.06, 3),
};

const ui = {
  playPause: document.getElementById("playPause"),
  reset: document.getElementById("reset"),
  showForces: document.getElementById("showForces"),
  followPointer: document.getElementById("followPointer"),
  modeLabel: document.getElementById("modeLabel"),
  speedMetric: document.getElementById("speedMetric"),
  densityMetric: document.getElementById("densityMetric"),
  riskMetric: document.getElementById("riskMetric"),
};

const presets = {
  fish: {
    label: "Fish",
    shape: "fish",
    colorA: "#64d49b",
    colorB: "#5fcbd6",
    count: 180,
    separation: 1.45,
    alignment: 1.0,
    cohesion: 0.82,
    target: 0.38,
    perception: 72,
    avoid: 28,
    speed: 3.2,
    turn: 0.06,
  },
  birds: {
    label: "Birds",
    shape: "bird",
    colorA: "#f0d276",
    colorB: "#f29f7e",
    count: 140,
    separation: 1.25,
    alignment: 1.45,
    cohesion: 0.7,
    target: 0.28,
    perception: 96,
    avoid: 34,
    speed: 4.5,
    turn: 0.045,
  },
  swarm: {
    label: "Swarm",
    shape: "dot",
    colorA: "#e97070",
    colorB: "#dca6ff",
    count: 260,
    separation: 1.75,
    alignment: 0.58,
    cohesion: 1.15,
    target: 0.52,
    perception: 58,
    avoid: 22,
    speed: 2.6,
    turn: 0.085,
  },
};

let boids = [];
let running = true;
let presetName = "fish";
let target = { x: 0, y: 0, active: false };
let metrics = { speed: 0, neighbors: 0, risk: 0 };
let lastTime = performance.now();

class Vec {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  mult(n) {
    this.x *= n;
    this.y *= n;
    return this;
  }

  div(n) {
    if (n !== 0) {
      this.x /= n;
      this.y /= n;
    }
    return this;
  }

  mag() {
    return Math.hypot(this.x, this.y);
  }

  normalize() {
    const m = this.mag();
    if (m > 0) this.div(m);
    return this;
  }

  limit(max) {
    const m = this.mag();
    if (m > max) this.normalize().mult(max);
    return this;
  }

  copy() {
    return new Vec(this.x, this.y);
  }

  static sub(a, b) {
    return new Vec(a.x - b.x, a.y - b.y);
  }
}

class Boid {
  constructor(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.4 + Math.random() * 1.6;
    this.pos = new Vec(x, y);
    this.vel = new Vec(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.acc = new Vec();
    this.size = 4.5 + Math.random() * 3;
    this.phase = Math.random() * Math.PI * 2;
  }

  step(neighbors, dt) {
    const cfg = readConfig();
    const steering = this.flock(neighbors, cfg);
    const goal = this.seekTarget(cfg);
    const boundary = this.stayInside(cfg);

    this.acc.add(steering).add(goal).add(boundary);
    this.vel.add(this.acc.mult(dt * 60)).limit(cfg.speed);
    this.pos.add(this.vel.copy().mult(dt * 60));
    this.acc.mult(0);
    this.wrap();
  }

  flock(neighbors, cfg) {
    const separation = new Vec();
    const alignment = new Vec();
    const cohesion = new Vec();
    let total = 0;
    let close = 0;

    for (const other of neighbors) {
      if (other === this) continue;
      const offset = Vec.sub(this.pos, other.pos);
      const d = offset.mag();
      if (d > 0 && d < cfg.perception) {
        alignment.add(other.vel);
        cohesion.add(other.pos);
        total += 1;
      }
      if (d > 0 && d < cfg.avoid) {
        separation.add(offset.div(Math.max(d * d, 1)));
        close += 1;
      }
    }

    if (total > 0) {
      alignment.div(total).normalize().mult(cfg.speed).sub(this.vel).limit(cfg.turn).mult(cfg.alignment);
      cohesion.div(total).sub(this.pos).normalize().mult(cfg.speed).sub(this.vel).limit(cfg.turn).mult(cfg.cohesion);
    }

    if (close > 0) {
      separation.div(close).normalize().mult(cfg.speed).sub(this.vel).limit(cfg.turn * 1.9).mult(cfg.separation);
    }

    return separation.add(alignment).add(cohesion);
  }

  seekTarget(cfg) {
    if (!ui.followPointer.checked || !target.active) return new Vec();
    const desired = new Vec(target.x - this.pos.x, target.y - this.pos.y);
    const d = desired.mag();
    if (d < 18) return new Vec();
    return desired.normalize().mult(cfg.speed).sub(this.vel).limit(cfg.turn).mult(cfg.target);
  }

  stayInside(cfg) {
    const margin = Math.min(canvas.width, canvas.height) * 0.11;
    const steer = new Vec();
    if (this.pos.x < margin) steer.x = cfg.speed;
    if (this.pos.x > canvas.width - margin) steer.x = -cfg.speed;
    if (this.pos.y < margin) steer.y = cfg.speed;
    if (this.pos.y > canvas.height - margin) steer.y = -cfg.speed;
    return steer.limit(cfg.turn * 2.2);
  }

  wrap() {
    const pad = 26;
    if (this.pos.x < -pad) this.pos.x = canvas.width + pad;
    if (this.pos.x > canvas.width + pad) this.pos.x = -pad;
    if (this.pos.y < -pad) this.pos.y = canvas.height + pad;
    if (this.pos.y > canvas.height + pad) this.pos.y = -pad;
  }

  draw(i) {
    const preset = presets[presetName];
    const angle = Math.atan2(this.vel.y, this.vel.x);
    const speedRatio = Math.min(1, this.vel.mag() / Math.max(readConfig().speed, 0.1));

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(angle);

    if (ui.showForces.checked && i % 18 === 0) {
      ctx.strokeStyle = "rgba(238, 244, 238, 0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, readConfig().perception, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(34 + speedRatio * 16, 0);
      ctx.strokeStyle = "rgba(100, 212, 155, 0.35)";
      ctx.stroke();
    }

    const blend = i % 2 === 0 ? preset.colorA : preset.colorB;
    ctx.fillStyle = blend;
    ctx.strokeStyle = "rgba(8, 11, 12, 0.42)";
    ctx.lineWidth = 1;

    if (preset.shape === "bird") {
      drawBird(this.size);
    } else if (preset.shape === "dot") {
      drawDot(this.size);
    } else {
      drawFish(this.size, this.phase + performance.now() * 0.006);
    }

    ctx.restore();
  }
}

function drawFish(size, phase) {
  const tail = Math.sin(phase) * size * 0.48;
  ctx.beginPath();
  ctx.moveTo(size * 2.1, 0);
  ctx.quadraticCurveTo(size * 0.2, -size * 1.0, -size * 1.3, -size * 0.55);
  ctx.lineTo(-size * 2.1, tail);
  ctx.lineTo(-size * 1.3, size * 0.55);
  ctx.quadraticCurveTo(size * 0.2, size * 1.0, size * 2.1, 0);
  ctx.fill();
  ctx.stroke();
}

function drawBird(size) {
  ctx.beginPath();
  ctx.moveTo(size * 2.1, 0);
  ctx.lineTo(-size * 1.2, -size * 1.25);
  ctx.lineTo(-size * 0.35, 0);
  ctx.lineTo(-size * 1.2, size * 1.25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawDot(size) {
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.max(320, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  target.x = canvas.width / (2 * dpr);
  target.y = canvas.height / (2 * dpr);
}

function spawn(count = Number(controls.count.input.value)) {
  boids = [];
  const rect = canvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  for (let i = 0; i < count; i += 1) {
    const r = Math.sqrt(Math.random()) * Math.min(rect.width, rect.height) * 0.34;
    const a = Math.random() * Math.PI * 2;
    boids.push(new Boid(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
}

function animate(now) {
  const dt = Math.min(0.035, (now - lastTime) / 1000 || 0.016);
  lastTime = now;

  if (running) {
    for (const boid of boids) boid.step(boids, dt);
    updateMetrics();
  }

  paint();
  requestAnimationFrame(animate);
}

function paint() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  drawEnvironment(rect.width, rect.height);

  if (ui.followPointer.checked && target.active) {
    drawTarget();
  }

  boids.forEach((boid, i) => boid.draw(i));
  ui.speedMetric.textContent = `速度 ${metrics.speed.toFixed(2)}`;
  ui.densityMetric.textContent = `邻居 ${metrics.neighbors.toFixed(1)}`;
  ui.riskMetric.textContent = `碰撞风险 ${metrics.risk.toFixed(1)}%`;
}

function drawEnvironment(width, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(238, 244, 238, 0.045)";
  ctx.lineWidth = 1;
  const step = 56;
  for (let x = 0; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTarget() {
  ctx.save();
  ctx.translate(target.x, target.y);
  ctx.strokeStyle = "rgba(232, 199, 102, 0.86)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.moveTo(-22, 0);
  ctx.lineTo(-7, 0);
  ctx.moveTo(7, 0);
  ctx.lineTo(22, 0);
  ctx.moveTo(0, -22);
  ctx.lineTo(0, -7);
  ctx.moveTo(0, 7);
  ctx.lineTo(0, 22);
  ctx.stroke();
  ctx.restore();
}

function updateMetrics() {
  const cfg = readConfig();
  let speedSum = 0;
  let neighborSum = 0;
  let risk = 0;
  const sample = Math.min(boids.length, 70);

  for (let i = 0; i < boids.length; i += 1) {
    speedSum += boids[i].vel.mag();
  }

  for (let i = 0; i < sample; i += 1) {
    const a = boids[i];
    for (let j = i + 1; j < sample; j += 1) {
      const d = Vec.sub(a.pos, boids[j].pos).mag();
      if (d < cfg.perception) neighborSum += 1;
      if (d < cfg.avoid * 0.72) risk += 1;
    }
  }

  metrics.speed = speedSum / Math.max(boids.length, 1);
  metrics.neighbors = neighborSum / Math.max(sample, 1);
  metrics.risk = Math.min(100, (risk / Math.max(sample, 1)) * 14);
}

function bindRange(id, fallback, precision) {
  const input = document.getElementById(id);
  const output = document.getElementById(`${id}Out`);
  const sync = () => {
    const value = Number(input.value || fallback);
    output.textContent = value.toFixed(precision);
  };
  input.addEventListener("input", sync);
  sync();
  return { input, output };
}

function readConfig() {
  return {
    count: Number(controls.count.input.value),
    separation: Number(controls.separation.input.value),
    alignment: Number(controls.alignment.input.value),
    cohesion: Number(controls.cohesion.input.value),
    target: Number(controls.target.input.value),
    perception: Number(controls.perception.input.value),
    avoid: Number(controls.avoid.input.value),
    speed: Number(controls.speed.input.value),
    turn: Number(controls.turn.input.value),
  };
}

function applyPreset(name) {
  presetName = name;
  const preset = presets[name];
  for (const [key, value] of Object.entries(preset)) {
    if (!controls[key]) continue;
    controls[key].input.value = value;
    controls[key].input.dispatchEvent(new Event("input"));
  }
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === name);
  });
  ui.modeLabel.textContent = preset.label;
  spawn(preset.count);
}

function syncTarget(event) {
  const rect = canvas.getBoundingClientRect();
  target.x = event.clientX - rect.left;
  target.y = event.clientY - rect.top;
  target.active = true;
}

window.addEventListener("resize", () => {
  resize();
  spawn();
});

canvas.addEventListener("pointermove", syncTarget);
canvas.addEventListener("pointerdown", syncTarget);
canvas.addEventListener("pointerleave", () => {
  target.active = false;
});

controls.count.input.addEventListener("change", () => spawn());
ui.playPause.addEventListener("click", () => {
  running = !running;
  ui.playPause.textContent = running ? "Pause" : "Play";
});
ui.reset.addEventListener("click", () => spawn());

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});

resize();
applyPreset("fish");
requestAnimationFrame(animate);
