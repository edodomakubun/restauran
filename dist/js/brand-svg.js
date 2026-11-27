// Animasi Logo & Teks "Dapur Laris Manis" menggunakan SVG.js (@svgdotjs/svg.js lokal)
import { SVG } from './vendor/svg.esm.js';

const LOGO_CUTLERY_PATH =
  'M188 188v78c0 16 11 28 24 31v85c0 8 6 14 14 14s14-6 14-14v-85c13-3 24-15 24-31v-78c0-6-5-11-11-11s-11 5-11 11v58h-10v-58c0-6-5-11-11-11s-11 5-11 11v58h-10v-58c0-6-5-11-11-11s-11 5-11 11zm122-11c-14 0-26 12-26 28v104c0 9 7 16 16 16h6v57c0 8 6 14 14 14s14-6 14-14V205c0-16-10-28-24-28z';

function prefersReducedMotion() {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

/**
 * Merender dan menganimasikan ikon logo Dapur Laris Manis dengan SVG.js.
 */
export function renderAnimatedBrandLogo(
  container,
  { size = 56, loopPulse = false, interactive = true } = {}
) {
  if (!container) return null;
  try {
    const reduced = prefersReducedMotion();
    container.replaceChildren();

    const draw = SVG().addTo(container).size(size, size).viewbox(0, 0, 512, 512);
    draw.attr({ role: 'img', 'aria-label': 'Logo Dapur Laris Manis' });
    draw.node.style.display = 'block';
    draw.node.style.overflow = 'visible';

    const grad = draw.gradient('linear', (add) => {
      add.stop(0, '#0d6efd');
      add.stop(1, '#0a58ca');
    });
    grad.from(0, 0).to(1, 1);

    const bg = draw.rect(512, 512).radius(112).fill(grad);
    const halo = draw.circle(284).center(256, 264).fill('#ffffff').attr({ 'fill-opacity': 0.16 });
    const plate = draw.circle(224).center(256, 264).fill('#ffffff');
    const cutlery = draw.path(LOGO_CUTLERY_PATH).fill('#0d6efd');

    if (reduced) {
      return draw;
    }

    const easeOut = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const easeSpring = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

    draw.node.animate(
      [
        { opacity: 0, transform: 'scale(0.76)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 420, fill: 'both', easing: easeSpring }
    );

    halo.node.style.transformOrigin = '256px 264px';
    halo.node.animate(
      [
        { opacity: 0, transform: 'scale(0.65)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 440, delay: 70, fill: 'both', easing: easeOut }
    );

    plate.node.style.transformOrigin = '256px 264px';
    plate.node.animate(
      [
        { opacity: 0, transform: 'scale(0.55)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 460, delay: 110, fill: 'both', easing: easeSpring }
    );

    const totalLen = typeof cutlery.length === 'function' ? cutlery.length() : 900;
    cutlery.attr({
      fill: '#0d6efd',
      stroke: '#0d6efd',
      'stroke-width': 9,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-dasharray': totalLen,
    });
    cutlery.node.style.transformOrigin = '256px 264px';
    cutlery.node.animate(
      [
        { strokeDashoffset: totalLen, fillOpacity: 0, strokeOpacity: 1 },
        { strokeDashoffset: 0, fillOpacity: 0.25, strokeOpacity: 1, offset: 0.68 },
        { strokeDashoffset: 0, fillOpacity: 1, strokeOpacity: 0 },
      ],
      { duration: 760, delay: 180, fill: 'both', easing: easeOut }
    );

    if (loopPulse) {
      halo.node.animate(
        [
          { transform: 'scale(0.96)', fillOpacity: 0.14 },
          { transform: 'scale(1.08)', fillOpacity: 0.28 },
          { transform: 'scale(0.96)', fillOpacity: 0.14 },
        ],
        { duration: 2200, delay: 800, iterations: Infinity, easing: 'ease-in-out' }
      );
    }

    if (interactive) {
      container.style.cursor = 'pointer';
      container.addEventListener('pointerenter', () => {
        cutlery.node.animate(
          [{ transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(-6deg) scale(1.05)' }],
          { duration: 180, fill: 'forwards', easing: easeOut }
        );
      });
      container.addEventListener('pointerleave', () => {
        cutlery.node.animate(
          [{ transform: 'rotate(-6deg) scale(1.05)' }, { transform: 'rotate(0deg) scale(1)' }],
          { duration: 200, fill: 'forwards', easing: easeOut }
        );
      });
      container.addEventListener('click', () => {
        cutlery.node.animate(
          [
            { transform: 'rotate(0deg) scale(1)' },
            { transform: 'rotate(8deg) scale(1.08)' },
            { transform: 'rotate(0deg) scale(1)' },
          ],
          { duration: 340, easing: easeSpring }
        );
      });
    }

    return draw;
  } catch {
    return null;
  }
}

/**
 * Merender dan menganimasikan teks "Dapur Laris Manis" dengan SVG.js.
 */
export function renderAnimatedBrandTitle(
  container,
  { text = 'Dapur Laris Manis', fontSize = 28, width = 360, height = 56, delayMs = 80 } = {}
) {
  if (!container) return null;
  try {
    const reduced = prefersReducedMotion();
    container.replaceChildren();

    const draw = SVG().addTo(container).viewbox(0, 0, width, height);
    draw.attr({
      role: 'img',
      'aria-label': text,
      width: '100%',
      height: String(height),
    });
    draw.node.style.maxWidth = `${width}px`;
    draw.node.style.display = 'block';
    draw.node.style.margin = '0 auto';
    draw.node.style.overflow = 'visible';

    const label = draw
      .plain(text)
      .addClass('brand-svg-title-text')
      .font({
        family: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        size: fontSize,
        weight: 800,
        anchor: 'middle',
      })
      .attr({
        x: width / 2,
        y: Math.round(height * 0.62),
        'letter-spacing': '-0.02em',
      });

    const accentW = Math.round(width * 0.42);
    const x1 = Math.round((width - accentW) / 2);
    const yLine = Math.round(height * 0.86);
    const underline = draw
      .line(x1, yLine, x1 + accentW, yLine)
      .stroke({ color: '#0d6efd', width: 3.5, linecap: 'round' });

    if (reduced) {
      return draw;
    }

    const easeOut = 'cubic-bezier(0.22, 1, 0.36, 1)';
    label.node.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 480, delay: delayMs, fill: 'both', easing: easeOut }
    );

    underline.attr({ 'stroke-dasharray': accentW });
    underline.node.animate(
      [
        { strokeDashoffset: accentW, opacity: 0.3 },
        { strokeDashoffset: 0, opacity: 1 },
      ],
      { duration: 480, delay: delayMs + 160, fill: 'both', easing: easeOut }
    );

    return draw;
  } catch {
    return null;
  }
}
