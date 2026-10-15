import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

export const VALID_SPEC = fileURLToPath(new URL('./fixtures/spec-valid', import.meta.url));

export function copyFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'site-spec-'));
  cpSync(VALID_SPEC, dir, { recursive: true });
  return dir;
}

export function editYaml(dir, rel, mutate) {
  const path = join(dir, rel);
  const data = parse(readFileSync(path, 'utf8'));
  mutate(data);
  writeFileSync(path, stringify(data));
}
