"use client";

/**
 * @author: @dorianbaffier
 * @description: Topo Background
 * @version: 1.1.0
 * @date: 2026-10-14
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface TopoBackgroundProps {
  className?: string;
  children?: ReactNode;
  interval?: number;
  speed?: number;
  interactive?: boolean;
  seed?: number;
  labels?: boolean;
}

const CELL = 12;
const TERRAIN_SCALE = 360;
const INDEX_EVERY = 5;
const HILL_HEIGHT = 0.5;
const HILL_SPREAD = 120;
const HILL_FOLLOW = 9;
const HILL_RISE = 5;
const RIPPLE_MS = 1800;
const RIPPLE_SPEED = 0.24;
const RIPPLE_WIDTH = 42;
const RIPPLE_HEIGHT = 0.2;
const RIPPLE_WAVELENGTH = 96;
const IDLE_FRAME_MS = 33;
const LABEL_SPACING = 210;
const LABEL_BASE = 500;
const LABEL_STEP = 20;
const LABEL_MARGIN = 0.16;
const MAX_LABEL_ANGLE = Math.PI / 3;
const LABEL_FONT =
  "500 10px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";

interface LabelSlots {
  drift: number;
  width: number;
  height: number;
  best: Map<number, Label>;
  avoid: { x0: number; y0: number; x1: number; y1: number }[];
}

interface Label {
  x: number;
  y: number;
  angle: number;
  level: number;
  score: number;
}

interface Ripple {
  x: number;
  y: number;
  start: number;
}

function createNoise(seed: number) {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let state = seed >>> 0 || 1;
  const random = () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
  }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const grad = (hash: number, x: number, y: number, z: number) => {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    let v = z;
    if (h < 4) {
      v = y;
    } else if (h === 12 || h === 14) {
      v = x;
    }
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };

  return (x: number, y: number, z: number) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const fz = z - Math.floor(z);
    const u = fade(fx);
    const v = fade(fy);
    const w = fade(fz);
    const A = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;
    return lerp(
      lerp(
        lerp(grad(perm[AA], fx, fy, fz), grad(perm[BA], fx - 1, fy, fz), u),
        lerp(
          grad(perm[AB], fx, fy - 1, fz),
          grad(perm[BB], fx - 1, fy - 1, fz),
          u
        ),
        v
      ),
      lerp(
        lerp(
          grad(perm[AA + 1], fx, fy, fz - 1),
          grad(perm[BA + 1], fx - 1, fy, fz - 1),
          u
        ),
        lerp(
          grad(perm[AB + 1], fx, fy - 1, fz - 1),
          grad(perm[BB + 1], fx - 1, fy - 1, fz - 1),
          u
        ),
        v
      ),
      w
    );
  };
}

function cellSegments(
  path: Path2D,
  index: number,
  box: { x0: number; y0: number; x1: number; y1: number },
  cross: { top: number; right: number; bottom: number; left: number }
) {
  const { x0, y0, x1, y1 } = box;
  const { top, right, bottom, left } = cross;
  const line = (ax: number, ay: number, bx: number, by: number) => {
    path.moveTo(ax, ay);
    path.lineTo(bx, by);
  };
  switch (index) {
    case 1:
    case 14:
      line(x0, left, bottom, y1);
      break;
    case 2:
    case 13:
      line(bottom, y1, x1, right);
      break;
    case 3:
    case 12:
      line(x0, left, x1, right);
      break;
    case 4:
    case 11:
      line(top, y0, x1, right);
      break;
    case 6:
    case 9:
      line(top, y0, bottom, y1);
      break;
    case 7:
    case 8:
      line(x0, left, top, y0);
      break;
    case 5:
      line(x0, left, top, y0);
      line(bottom, y1, x1, right);
      break;
    case 10:
      line(top, y0, x1, right);
      line(x0, left, bottom, y1);
      break;
    default:
      break;
  }
}

function offerLabel(slots: LabelSlots, label: Omit<Label, "score">) {
  const { x, y } = label;
  if (
    y < slots.height * LABEL_MARGIN ||
    y > slots.height * (1 - LABEL_MARGIN) ||
    x < 24 ||
    x > slots.width - 24 ||
    slots.avoid.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)
  ) {
    return;
  }
  const row = Math.floor(y / LABEL_SPACING);
  const shifted = x + slots.drift + (row % 2) * (LABEL_SPACING / 2);
  const col = Math.floor(shifted / LABEL_SPACING);
  const cx = (col + 0.5) * LABEL_SPACING;
  const cy = (row + 0.5) * LABEL_SPACING;
  const score = (shifted - cx) ** 2 + (y - cy) ** 2;
  if (score > (LABEL_SPACING * 0.32) ** 2) {
    return;
  }
  const key = row * 100_000 + col;
  const current = slots.best.get(key);
  if (!current || score < current.score) {
    slots.best.set(key, { ...label, score });
  }
}

function offerCellLabel(
  slots: LabelSlots,
  [a, b, c, d]: [number, number, number, number],
  x0: number,
  y0: number,
  level: number,
  t: number
) {
  const gx = b - a + c - d;
  const gy = d - a + c - b;
  const px = gx / (2 * CELL);
  const py = gy / (2 * CELL);
  const g2 = px * px + py * py;
  const lift = g2 > 0 ? (t - (a + b + c + d) / 4) / g2 : 0;
  const half = CELL / 2;
  const ox = Math.max(-half, Math.min(half, lift * px));
  const oy = Math.max(-half, Math.min(half, lift * py));
  let angle = Math.atan2(gx, -gy);
  if (angle > Math.PI / 2) {
    angle -= Math.PI;
  } else if (angle < -Math.PI / 2) {
    angle += Math.PI;
  }
  if (Math.abs(angle) > MAX_LABEL_ANGLE) {
    return;
  }
  offerLabel(slots, { x: x0 + half + ox, y: y0 + half + oy, angle, level });
}

function traceCell(
  field: Float32Array,
  cols: number,
  i: number,
  j: number,
  interval: number,
  paths: { minor: Path2D; major: Path2D; slots: LabelSlots | null }
) {
  const a = field[j * cols + i];
  const b = field[j * cols + i + 1];
  const c = field[(j + 1) * cols + i + 1];
  const d = field[(j + 1) * cols + i];
  const x0 = i * CELL;
  const y0 = j * CELL;
  const first = Math.ceil(Math.min(a, b, c, d) / interval);
  const last = Math.floor(Math.max(a, b, c, d) / interval);
  if (first > last) {
    return;
  }
  const box = { x0, y0, x1: x0 + CELL, y1: y0 + CELL };
  for (let level = first; level <= last; level++) {
    const t = level * interval;
    const index =
      (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
    if (index === 0 || index === 15) {
      continue;
    }
    const isIndex = level % INDEX_EVERY === 0;
    cellSegments(isIndex ? paths.major : paths.minor, index, box, {
      top: x0 + CELL * ((t - a) / (b - a)),
      right: y0 + CELL * ((t - b) / (c - b)),
      bottom: x0 + CELL * ((t - d) / (c - d)),
      left: y0 + CELL * ((t - a) / (d - a)),
    });
    if (isIndex && paths.slots && index !== 5 && index !== 10) {
      offerCellLabel(paths.slots, [a, b, c, d], x0, y0, level, t);
    }
  }
}

function traceContours(
  field: Float32Array,
  cols: number,
  rows: number,
  interval: number,
  minor: Path2D,
  major: Path2D,
  slots: LabelSlots | null
) {
  const paths = { minor, major, slots };
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      traceCell(field, cols, i, j, interval, paths);
    }
  }
}

interface Hill {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  amount: number;
  on: boolean;
}

function stepHill(hill: Hill, dt: number) {
  const follow = 1 - Math.exp(-HILL_FOLLOW * dt);
  hill.x += (hill.targetX - hill.x) * follow;
  hill.y += (hill.targetY - hill.y) * follow;
  const goal = hill.on ? 1 : 0;
  hill.amount += (goal - hill.amount) * (1 - Math.exp(-HILL_RISE * dt));
  return (
    Math.abs(hill.targetX - hill.x) > 0.5 ||
    Math.abs(hill.targetY - hill.y) > 0.5 ||
    Math.abs(goal - hill.amount) > 0.002
  );
}

export default function TopoBackground({
  className,
  children,
  interval = 0.07,
  speed = 1,
  interactive = true,
  seed = 26,
  labels = true,
}: TopoBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!(root && canvas && ctx)) {
      return;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const noise = createNoise(seed);

    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let field = new Float32Array(0);
    let color = "";

    const hill: Hill = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      amount: 0,
      on: false,
    };
    const ripples: Ripple[] = [];
    let time = 0;
    let last = 0;
    let lastPaint = 0;
    let raf = 0;
    let visible = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / CELL) + 1;
      rows = Math.ceil(height / CELL) + 1;
      field = new Float32Array(cols * rows);
      color = getComputedStyle(canvas).color;
      measureContent();
    };

    const sample = (now: number) => {
      const z = time * 0.05;
      const drift = time * 6;
      const hillOn = hill.amount > 0.001;
      const spread = 2 * HILL_SPREAD * HILL_SPREAD;
      const ringWidth = 2 * RIPPLE_WIDTH * RIPPLE_WIDTH;
      for (let j = 0; j < rows; j++) {
        const y = j * CELL;
        for (let i = 0; i < cols; i++) {
          const x = i * CELL;
          const nx = (x + drift) / TERRAIN_SCALE;
          const ny = y / TERRAIN_SCALE;
          let v =
            noise(nx, ny, z) * 0.78 +
            noise(nx * 2.3 + 17.1, ny * 2.3 + 4.7, z * 1.4) * 0.22;
          if (hillOn) {
            const dx = x - hill.x;
            const dy = y - hill.y;
            v +=
              HILL_HEIGHT *
              hill.amount *
              Math.exp(-(dx * dx + dy * dy) / spread);
          }
          for (const ripple of ripples) {
            const age = now - ripple.start;
            const reach = age * RIPPLE_SPEED;
            const d = Math.hypot(x - ripple.x, y - ripple.y) - reach;
            const fadeOut = 1 - age / RIPPLE_MS;
            v +=
              RIPPLE_HEIGHT *
              fadeOut *
              fadeOut *
              Math.exp(-(d * d) / ringWidth) *
              Math.cos((d / RIPPLE_WAVELENGTH) * Math.PI * 2);
          }
          field[j * cols + i] = v;
        }
      }
    };

    const slots: LabelSlots = {
      drift: 0,
      width: 0,
      height: 0,
      best: new Map(),
      avoid: [],
    };
    const measureContent = () => {
      const origin = canvas.getBoundingClientRect();
      slots.avoid = [];
      for (const child of Array.from(root.children)) {
        if (child.contains(canvas)) {
          continue;
        }
        const r = child.getBoundingClientRect();
        slots.avoid.push({
          x0: r.left - origin.left - 16,
          y0: r.top - origin.top - 12,
          x1: r.right - origin.left + 16,
          y1: r.bottom - origin.top + 12,
        });
      }
    };

    const drawLabels = () => {
      ctx.font = LABEL_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const label of slots.best.values()) {
        const text = `${LABEL_BASE + label.level * LABEL_STEP}`;
        const w = ctx.measureText(text).width + 8;
        ctx.save();
        ctx.translate(Math.round(label.x), Math.round(label.y));
        ctx.rotate(label.angle);
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = 1;
        ctx.fillRect(-w / 2, -6, w, 12);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.5;
        ctx.fillText(text, 0, 0.5);
        ctx.restore();
      }
    };

    const paint = (now: number) => {
      sample(now);
      const minor = new Path2D();
      const major = new Path2D();
      slots.best.clear();
      slots.drift = time * 6;
      slots.width = width;
      slots.height = height;
      traceContours(
        field,
        cols,
        rows,
        interval,
        minor,
        major,
        labels ? slots : null
      );
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 0.75;
      ctx.stroke(minor);
      ctx.globalAlpha = 0.34;
      ctx.lineWidth = 1.1;
      ctx.stroke(major);
      if (labels) {
        drawLabels();
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible) {
        return;
      }
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      const hillMoving = stepHill(hill, dt);
      while (ripples.length > 0 && now - ripples[0].start > RIPPLE_MS) {
        ripples.shift();
      }
      const settling = hillMoving || ripples.length > 0;

      time += dt * speed;
      if (settling || now - lastPaint >= IDLE_FRAME_MS) {
        paint(now);
        lastPaint = now;
      }
      if (speed > 0 || settling) {
        raf = requestAnimationFrame(frame);
      }
    };

    const start = () => {
      if (!raf && visible && !reduceMotion) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    let colorTimer = 0;
    const checkColor = () => {
      const next = getComputedStyle(canvas).color;
      if (next !== color) {
        color = next;
        if (reduceMotion || !raf) {
          paint(performance.now());
        }
      }
    };
    const watchColor = () => {
      if (visible && !colorTimer) {
        checkColor();
        colorTimer = window.setInterval(checkColor, 500);
      } else if (!visible && colorTimer) {
        window.clearInterval(colorTimer);
        colorTimer = 0;
      }
    };

    resize();
    paint(performance.now());
    canvas.style.opacity = "1";
    start();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      paint(performance.now());
    });
    resizeObserver.observe(canvas);

    let onScreen = true;
    const updateVisible = () => {
      visible = onScreen && document.visibilityState === "visible";
      watchColor();
      if (visible) {
        start();
      }
    };
    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      updateVisible();
    });
    intersection.observe(root);
    document.addEventListener("visibilitychange", updateVisible);
    watchColor();

    const local = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      const point = local(event);
      if (!hill.on) {
        hill.x = point.x;
        hill.y = point.y;
      }
      hill.targetX = point.x;
      hill.targetY = point.y;
      hill.on = true;
      start();
    };
    const onLeave = () => {
      hill.on = false;
      start();
    };
    const onDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest("a, button, input, textarea")) {
        return;
      }
      const point = local(event);
      ripples.push({ ...point, start: performance.now() });
      if (ripples.length > 4) {
        ripples.shift();
      }
      start();
    };
    if (interactive && !reduceMotion) {
      root.addEventListener("pointermove", onMove);
      root.addEventListener("pointerleave", onLeave);
      root.addEventListener("pointerdown", onDown);
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", updateVisible);
      window.clearInterval(colorTimer);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onDown);
    };
  }, [interval, speed, interactive, seed, labels]);

  return (
    <div
      className={cn(
        "relative flex min-h-[560px] w-full items-center justify-center overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100",
        className
      )}
      ref={rootRef}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas
          className="h-full w-full opacity-0 transition-opacity duration-500 ease-out"
          ref={canvasRef}
          style={{
            maskImage:
              "linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)",
          }}
        />
      </div>
      {children}
    </div>
  );
}