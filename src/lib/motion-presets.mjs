// Motion presets for the post-QA polish phase. Only transform/opacity/filter/shadow/underline change,
// so effects never shift layout, and every scroll/load effect ends exactly in the approved design.
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const t = (...props) => props.map((p) => `${p} 250ms ${EASE}`).join(', ');

export const MOTION_PRESETS = {
  // Hover (Webflow style state "hover" on the target class)
  'hover-lift': { kind: 'hover', base: { transition: t('transform', 'box-shadow') }, hover: { transform: 'translateY(-2px)', 'box-shadow': '0 10px 24px rgba(0, 0, 0, 0.12)' } },
  'hover-scale': { kind: 'hover', base: { transition: t('transform') }, hover: { transform: 'scale(1.03)' } },
  'hover-image-zoom': { kind: 'hover', base: { transition: 'transform 600ms ' + EASE }, hover: { transform: 'scale(1.06)' } },
  'hover-darken': { kind: 'hover', base: { transition: t('filter') }, hover: { filter: 'brightness(0.92)' } },
  'hover-fade': { kind: 'hover', base: { transition: t('opacity') }, hover: { opacity: '0.8' } },
  'hover-underline': { kind: 'hover', base: { 'text-underline-offset': '0.2em' }, hover: { 'text-decoration-line': 'underline' } },
  // Scroll / load (native IX3)
  'scroll-fade-up': { kind: 'interaction', trigger: 'scroll', from: { opacity: 0, y: 24 }, duration: 0.7 },
  'scroll-fade-in': { kind: 'interaction', trigger: 'scroll', from: { opacity: 0 }, duration: 0.6 },
  'scroll-stagger-children': { kind: 'interaction', trigger: 'scroll', target: 'children', from: { opacity: 0, y: 20 }, duration: 0.6, stagger: 0.08 },
  'scroll-scale-in': { kind: 'interaction', trigger: 'scroll', from: { opacity: 0, scale: 0.96 }, duration: 0.7 },
  'scroll-parallax-y': { kind: 'interaction', trigger: 'scroll-scrub', from: { y: 40 }, to: { y: -40 } },
  'load-fade-up': { kind: 'interaction', trigger: 'load', from: { opacity: 0, y: 24 }, duration: 0.8, stagger: 0.08, target: 'children' },
  'heading-line-reveal': { kind: 'interaction', trigger: 'scroll', from: { y: 100 }, duration: 0.8, split: 'lines' },
};
