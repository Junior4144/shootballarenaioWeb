import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const registry = 'us-central1-docker.pkg.dev/project-7915787f-37b2-4286-aa7/shootball-test';
const images = ['control-plane', 'game-server'];
export function validateManifest(value, image, sha) {
  assert(images.includes(image), 'Unknown image');
  assert.match(sha ?? '', /^[a-f0-9]{40}$/, 'Invalid release commit');
  assert.equal(value.image, image, 'Image mismatch');
  assert.equal(value.sha, sha, 'Manifest belongs to another commit');
  assert.equal(value.repository, registry + '/' + image, 'Repository scope mismatch');
  assert.match(value.digest ?? '', /^sha256:[a-f0-9]{64}$/, 'Invalid immutable digest');
  return value.digest;
}
export function manifestFromInspect(inspections, image, sha) {
  assert(images.includes(image), 'Unknown image');
  assert.match(sha ?? '', /^[a-f0-9]{40}$/);
  assert(Array.isArray(inspections) && inspections.length === 1, 'Expected one tested image');
  const repository = registry + '/' + image;
  assert(inspections[0].RepoTags?.includes(repository + ':' + sha), 'Tested commit tag missing');
  const refs = inspections[0].RepoDigests?.filter(ref => ref.startsWith(repository + '@')) ?? [];
  assert.equal(refs.length, 1, 'Expected exactly one published digest for the tested image');
  const value = { image, sha, repository, digest: refs[0].slice(repository.length + 1) };
  validateManifest(value, image, sha);
  return value;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'record') {
    const [image, sha, inspectionPath, directory] = args;
    const value = manifestFromInspect(JSON.parse(readFileSync(inspectionPath, 'utf8')), image, sha);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, image + '.json'), JSON.stringify(value, null, 2) + '\n');
  } else if (command === 'collect') {
    const values = images.map(image => validateManifest(JSON.parse(readFileSync(join(args[0], image + '.json'), 'utf8')), image, process.env.RELEASE_SHA));
    assert(process.env.GITHUB_OUTPUT, 'GitHub output file required');
    appendFileSync(process.env.GITHUB_OUTPUT, 'control=' + values[0] + '\ngame=' + values[1] + '\n');
  } else throw new Error('Expected record or collect');
}
