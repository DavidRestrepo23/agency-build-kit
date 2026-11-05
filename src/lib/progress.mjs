// Project memory: a human-readable log (site-spec/progress.md) written at every milestone,
// plus a resume point computed from build-state, so a new session knows where to continue.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HEADER = '# Progress\n\nWritten by the agency-build-kit commands at every milestone, so a new session knows where to resume. Do not edit past entries.\n';
const pad = (n) => String(n).padStart(2, '0');

export function appendProgress(specDir, { command, step, summary = '', next }, date = new Date()) {
  const path = join(specDir, 'progress.md');
  if (!existsSync(path)) writeFileSync(path, HEADER);
  const when = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
  let entry = `\n## ${when} · ${command} · ${step}\n`;
  if (summary) entry += `\n${summary}\n`;
  if (next) entry += `\nNext: ${next}\n`;
  appendFileSync(path, entry);
  return { path, entry: entry.trim() };
}

function lastEntries(specDir, n = 3) {
  const path = specDir && join(specDir, 'progress.md');
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\n(?=## )/).filter((b) => b.startsWith('## ')).slice(-n).map((b) => b.trim().replace(/\n+/g, ' — '));
}

export function resumeStatus(spec) {
  const open = (String(spec.openQuestions ?? '').match(/^\s*[-*] \[ \] /gm) ?? []).length;
  const webflow = spec.buildState?.webflow ?? {};
  const pages = {};
  for (const [slug, page] of Object.entries(spec.pages ?? {})) {
    const p = { built: [], structureBuilt: [], toBuild: [], qaPass: [], qaFail: [] };
    for (const { id } of page.sections) {
      const status = webflow.pages?.[slug]?.sections?.[id]?.status;
      if (status === 'built') p.built.push(id);
      else if (status === 'structure-built') p.structureBuilt.push(id);
      else if (status === 'qa-pass') p.qaPass.push(id);
      else if (status === 'qa-fail') p.qaFail.push(id);
      else p.toBuild.push(id);
    }
    pages[slug] = p;
  }
  const componentsPendingVisual = Object.entries(webflow.components ?? {}).filter(([, c]) => c.status !== 'built').map(([name]) => name);

  let next;
  const entries = Object.entries(pages);
  if (open > 0) next = `Resolve site-spec/open-questions.md (${open} open), then /webflow-builder:wf-setup`;
  else if (webflow.setup?.status !== 'done') next = '/webflow-builder:wf-setup';
  else {
    const find = (key) => entries.find(([, p]) => p[key].length);
    const toBuild = find('toBuild');
    const visual = find('structureBuilt');
    const qa = find('built');
    const fix = find('qaFail');
    if (toBuild) next = `/webflow-builder:wf-build ${toBuild[0]} --phase structure (pending: ${toBuild[1].toBuild.join(', ')})`;
    else if (visual || componentsPendingVisual.length) next = `/webflow-builder:wf-build ${(visual ?? entries[0])[0]} --phase visual (Designer open)`;
    else if (qa) next = `/webflow-builder:wf-qa ${qa[0]}`;
    else if (fix) next = `/webflow-builder:wf-qa ${fix[0]} --fix`;
    else {
      const unpolished = entries.find(([slug]) => !['done', 'skipped'].includes(webflow.motion?.[slug]?.status));
      next = unpolished
        ? `/webflow-builder:wf-motion ${unpolished[0]} (optional polish: hovers and scroll effects — or skip it)`
        : 'Done: every page passes QA — ready for the developer to publish';
    }
  }
  return { ok: true, openQuestions: open, setup: webflow.setup?.status ?? 'pending', pages, componentsPendingVisual, next, lastEntries: lastEntries(spec.dir) };
}

export function resumeText(status) {
  const lines = ['Agency Build Kit — resume point for this project (from site-spec/build-state.json and site-spec/progress.md):'];
  lines.push(`- Open questions: ${status.openQuestions} · Webflow setup: ${status.setup}`);
  for (const [slug, p] of Object.entries(status.pages ?? {})) {
    lines.push(`- Page ${slug}: built ${p.built.length + p.qaPass.length + p.qaFail.length}, structure only ${p.structureBuilt.length}, to build ${p.toBuild.length}, QA pass ${p.qaPass.length}, QA fail ${p.qaFail.length}`);
  }
  if (status.componentsPendingVisual?.length) lines.push(`- Components not yet compared with Figma: ${status.componentsPendingVisual.join(', ')}`);
  if (status.lastEntries?.length) lines.push('- Last milestones:', ...status.lastEntries.map((e) => `  · ${e}`));
  lines.push(`Next: ${status.next}`);
  return lines.join('\n');
}
