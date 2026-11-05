import { MOTION_PRESETS } from './motion-presets.mjs';

// Turns site-spec/motion.yaml into Webflow work: hover state styles on the target classes
// and native IX3 interactions targeted by a data-anim attribute.
export function planMotion(spec) {
  const plan = { ok: true, intensity: spec.motion?.intensity ?? null, styles: [], attributes: [], interactions: [] };
  for (const effect of spec.motion?.effects ?? []) {
    const preset = MOTION_PRESETS[effect.preset];
    if (!preset) throw new Error(`unknown preset "${effect.preset}"`);
    for (const target of effect.targets) {
      if (preset.kind === 'hover') {
        plan.styles.push({ class: target, breakpoint: 'main', props: { ...preset.base }, effect: effect.id });
        plan.styles.push({ class: target, breakpoint: 'main', state: 'hover', props: { ...preset.hover }, effect: effect.id });
      } else {
        plan.attributes.push({ targetClass: target, name: 'data-anim', value: effect.id });
      }
    }
    if (preset.kind === 'interaction') {
      plan.interactions.push({
        id: effect.id,
        preset: effect.preset,
        trigger: preset.trigger,
        selector: `[data-anim="${effect.id}"]`,
        target: preset.target ?? 'self',
        from: preset.from,
        to: preset.to ?? null,
        duration: effect.duration ?? preset.duration ?? null,
        stagger: effect.stagger ?? preset.stagger ?? null,
        split: preset.split ?? null,
        start: preset.trigger === 'scroll' ? 'top 85%' : null,
        reducedMotion: 'skip-to-end',
      });
    }
  }
  return plan;
}
