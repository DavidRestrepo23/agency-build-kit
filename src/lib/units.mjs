export function pxToRem(px) {
  if (typeof px !== 'number' || Number.isNaN(px)) {
    throw new TypeError(`pxToRem expects a number, got ${JSON.stringify(px)}`);
  }
  return `${Number((px / 16).toFixed(4))}rem`;
}
