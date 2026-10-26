/**
 * A real spring as a CSS easing: samples a damped spring into `linear()` (Safari 17.2+, Chrome 113+), so animations
 * settle with a small natural overshoot instead of the fixed shape of a cubic-bezier. Browsers without `linear()` get a
 * close cubic-bezier.
 */
export function springEasing(stiffness = 170, damping = 22, mass = 1, steps = 40): { easing: string; duration: number } {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = w0 * Math.sqrt(Math.max(1 - zeta * zeta, 1e-6));
  const at = (t: number) => (zeta < 1
    ? 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
    : 1 - Math.exp(-w0 * t) * (1 + w0 * t));
  // run until it stays within 0.1% of rest
  let end = 0.1;
  for (let t = 0.1; t < 4; t += 0.01) { end = t; if (Math.abs(at(t) - 1) < 0.001 && Math.abs(at(t + 0.1) - 1) < 0.001) break; }
  const pts = Array.from({ length: steps + 1 }, (_, i) => Math.round(at((end * i) / steps) * 1000) / 1000);
  pts[steps] = 1;
  return { easing: `linear(${pts.join(', ')})`, duration: Math.round(end * 1000) };
}

export const supportsLinearEasing = () => typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)') === true;

/** The lyric-line spring: quick, with a slight bounce. */
export const LINE_SPRING = (() => {
  const s = springEasing(190, 21);
  return supportsLinearEasing() ? s : { easing: 'cubic-bezier(.25, 1.25, .45, 1)', duration: 650 };
})();
