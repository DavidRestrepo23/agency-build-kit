import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLUGINS = ['build-core', 'webflow-builder'];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function frontmatter(path) {
  const match = readFileSync(path, 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${path} has no frontmatter`);
  return parse(match[1]);
}

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return entry.endsWith('.md') ? [path] : [];
  });
}

test('marketplace lists both plugins with existing sources', () => {
  const market = readJson(join(ROOT, '.claude-plugin/marketplace.json'));
  assert.equal(market.name, 'agency-build-kit');
  assert.deepEqual(market.plugins.map((p) => p.name), PLUGINS);
  for (const plugin of market.plugins) {
    assert.ok(existsSync(join(ROOT, plugin.source, '.claude-plugin/plugin.json')), plugin.source);
  }
});

const EXPECTED_FILES = {
  'build-core': [
    'skills/site-spec/SKILL.md',
    'skills/figma-extract/SKILL.md',
    'agents/figma-auditor.md',
    'commands/build-audit.md',
  ],
  'webflow-builder': [
    'skills/client-first/SKILL.md',
    'skills/wf-bootstrap/SKILL.md',
    'skills/wf-section-build/SKILL.md',
    'agents/wf-qa-reviewer.md',
    'commands/wf-setup.md',
    'commands/wf-build.md',
    'commands/wf-qa.md',
    'commands/wf-component.md',
  ],
};

for (const plugin of PLUGINS) {
  const dir = join(ROOT, 'plugins', plugin);

  test(`${plugin}: ships every expected skill, agent and command`, () => {
    for (const file of EXPECTED_FILES[plugin]) assert.ok(existsSync(join(dir, file)), `missing ${plugin}/${file}`);
  });

  test(`${plugin}: plugin.json name and version`, () => {
    const manifest = readJson(join(dir, '.claude-plugin/plugin.json'));
    assert.equal(manifest.name, plugin);
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.ok(manifest.description.length > 20);
  });

  test(`${plugin}: skills have matching name and description`, () => {
    const skillsDir = join(dir, 'skills');
    if (!existsSync(skillsDir)) return;
    // Skill folders may exist before their SKILL.md (e.g. site-spec/schemas lands before the skill text).
    for (const skill of readdirSync(skillsDir).filter((s) => existsSync(join(skillsDir, s, 'SKILL.md')))) {
      const fm = frontmatter(join(skillsDir, skill, 'SKILL.md'));
      assert.equal(fm.name, skill);
      assert.ok(fm.description?.length > 20, `${skill} description too short`);
    }
  });

  test(`${plugin}: commands have description`, () => {
    for (const file of markdownFiles(join(dir, 'commands'))) {
      assert.ok(frontmatter(file).description?.length > 10, file);
    }
  });

  test(`${plugin}: agents have matching name and description`, () => {
    for (const file of markdownFiles(join(dir, 'agents'))) {
      const fm = frontmatter(file);
      assert.equal(`${fm.name}.md`, file.split('/').pop());
      assert.ok(fm.description?.length > 20, file);
    }
  });

  test(`${plugin}: referenced scripts exist`, () => {
    for (const file of markdownFiles(dir)) {
      const text = readFileSync(file, 'utf8');
      for (const [, script] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/([a-z-]+\.mjs)/g)) {
        assert.ok(existsSync(join(dir, 'scripts', script)), `${file} references missing scripts/${script}`);
      }
    }
  });
}
