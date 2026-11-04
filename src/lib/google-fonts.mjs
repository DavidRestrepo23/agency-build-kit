// Google Fonts as files: the Webflow MCP only manages uploaded fonts, so Google families are
// downloaded (woff2, latin subset) and uploaded with data_fonts_tool create_font.
export const GOOGLE_CSS_BASE = 'https://fonts.googleapis.com';

export function googleCssUrl(family, weights, base = GOOGLE_CSS_BASE) {
  const list = [...new Set(weights.map(Number))].sort((a, b) => a - b).join(';');
  return `${base}/css2?family=${family.trim().replace(/\s+/g, '+')}:wght@${list}&display=swap`;
}

export function parseGoogleFontsCss(css) {
  const out = [];
  for (const [, subset, body] of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    if (subset !== 'latin') continue;
    const get = (prop) => body.match(new RegExp(`${prop}:\\s*([^;]+);`))?.[1].trim();
    const url = body.match(/url\(([^)]+)\)/)?.[1].replace(/['"]/g, '');
    out.push({ family: get('font-family').replace(/['"]/g, ''), weight: Number(get('font-weight')), style: get('font-style'), subset, url });
  }
  return out;
}
