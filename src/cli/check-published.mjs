// Checks the PUBLISHED page (not the Designer draft): fetches it without cache and reports the
// "Last Published" date, how often each marker appears, external scripts and native IX3 usage.
// usage: check-published <url> [marker ...]   e.g. section_hero  data-anim="marquee"
import { runCliAsync } from '../lib/cli.mjs';

await runCliAsync(async ([url, ...marks]) => {
  if (!url) throw new Error('usage: check-published <url> [marker ...]');
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}nc=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });
  const html = await res.text();
  const markers = Object.fromEntries(marks.map((m) => [m, html.split(m).length - 1]));
  const missing = marks.filter((m) => markers[m] === 0);
  return {
    ok: res.ok && missing.length === 0,
    status: res.status,
    lastPublished: html.match(/Last Published:\s*(.+?)\s*-->/)?.[1] ?? null,
    markers,
    missing,
    scripts: [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]),
    ix3: /w-mod-ix3|ix3/.test(html),
  };
});
