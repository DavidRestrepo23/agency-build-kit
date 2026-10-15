export function primaryVariantName(component) {
  if (!component?.variants?.length) return null;
  return component.variants.some((v) => v.name === 'primary') ? 'primary' : component.variants[0].name;
}
