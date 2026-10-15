import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'yaml';

export class SpecLoadError extends Error {
  constructor(file, message) {
    super(`${file}: ${message}`);
    this.name = 'SpecLoadError';
    this.file = file;
  }
}

function readYaml(dir, rel) {
  const path = join(dir, rel);
  if (!existsSync(path)) throw new SpecLoadError(rel, 'file not found');
  try {
    return parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new SpecLoadError(rel, `invalid YAML: ${err.message}`);
  }
}

export function loadSpec(dir) {
  if (!existsSync(dir)) throw new SpecLoadError(dir, 'site-spec directory not found');

  const pages = {};
  const pagesDir = join(dir, 'pages');
  if (existsSync(pagesDir)) {
    for (const file of readdirSync(pagesDir).filter((f) => f.endsWith('.yaml')).sort()) {
      pages[basename(file, '.yaml')] = readYaml(dir, join('pages', file));
    }
  }

  const openQuestionsPath = join(dir, 'open-questions.md');
  const buildStatePath = join(dir, 'build-state.json');
  let buildState = null;
  if (existsSync(buildStatePath)) {
    try {
      buildState = JSON.parse(readFileSync(buildStatePath, 'utf8'));
    } catch (err) {
      throw new SpecLoadError('build-state.json', `invalid JSON: ${err.message}`);
    }
  }

  return {
    dir,
    project: readYaml(dir, 'project.yaml'),
    tokens: readYaml(dir, 'tokens.yaml'),
    components: readYaml(dir, 'components.yaml'),
    assets: readYaml(dir, join('assets', 'manifest.yaml')),
    pages,
    openQuestions: existsSync(openQuestionsPath) ? readFileSync(openQuestionsPath, 'utf8') : '',
    buildState,
  };
}
