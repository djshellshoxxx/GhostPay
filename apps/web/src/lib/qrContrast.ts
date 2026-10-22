/** Colour maths for the QR palette checks (WCAG 2.x contrast and colour-vision-deficiency simulation). Pure, no DOM. */

export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m?.[1] === undefined) throw new Error(`bad hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lin(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type Cvd = 'protanopia' | 'deuteranopia' | 'tritanopia';

/** Machado et al. 2009 full-severity matrices, applied in linear RGB. */
const MATRICES: Readonly<Record<Cvd, readonly [Rgb, Rgb, Rgb]>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Returns the simulated linear-light RGB (0..1). */
export function simulateLinear(rgb: Rgb, cvd: Cvd): Rgb {
  const l: Rgb = [lin(rgb[0]), lin(rgb[1]), lin(rgb[2])];
  const m = MATRICES[cvd];
  const row = (r: Rgb): number => clamp01(r[0] * l[0] + r[1] * l[1] + r[2] * l[2]);
  return [row(m[0]), row(m[1]), row(m[2])];
}

function toLab(lr: Rgb): Rgb {
  const x = (0.4124564 * lr[0] + 0.3575761 * lr[1] + 0.1804375 * lr[2]) / 0.95047;
  const y = 0.2126729 * lr[0] + 0.7151522 * lr[1] + 0.072175 * lr[2];
  const z = (0.0193339 * lr[0] + 0.119192 * lr[1] + 0.9503041 * lr[2]) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference between two hex colours as seen under a deficiency (or normal vision when cvd is null). */
export function deltaE(a: string, b: string, cvd: Cvd | null): number {
  const conv = (h: string): Rgb => {
    const rgb = hexToRgb(h);
    return toLab(cvd === null ? [lin(rgb[0]), lin(rgb[1]), lin(rgb[2])] : simulateLinear(rgb, cvd));
  };
  const la = conv(a);
  const lb = conv(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}
