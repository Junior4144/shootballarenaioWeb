import { CONFIG, type GameConfig } from './config';
import { validateConfig } from './config-validation';
export type ConfigDiff = { path: string; before: unknown; after: unknown };
export function configDiff(before: unknown, after: unknown, path = ''): ConfigDiff[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => configDiff((before as Record<string,unknown>)[key], (after as Record<string,unknown>)[key], path ? path + '.' + key : key));
  }
  return [{ path, before, after }];
}
/** Reject untrusted shape before using the typed semantic validator. */
export function validateConfigDocument(input: unknown): string[] {
  const errors: string[] = [];
  const visit = (value: unknown, template: unknown, path: string) => {
    if (errors.length >= 50) return;
    if (Array.isArray(template)) {
      if (!Array.isArray(value) || value.length > 512) { errors.push(path + ' must be an array of at most 512 items'); return; }
      if (path.startsWith('presentation.audio.tones.') && value.length !== 3) errors.push(path + ' must have three values');
      value.forEach((item, i) => visit(item, template[0], path + '.' + i)); return;
    }
    if (template !== null && typeof template === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(path + ' must be an object'); return; }
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) if (!Object.hasOwn(template, key)) errors.push(path + '.' + key + ' is not a supported field');
      for (const [key, item] of Object.entries(template)) visit(record[key], item, path ? path + '.' + key : key);
      return;
    }
    if (typeof value !== typeof template || (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 1_000_000))) errors.push(path + ' has an invalid type or magnitude');
    if (typeof value === 'string' && value.length > 200) errors.push(path + ' is too long');
  };
  visit(input, CONFIG, '');
  if (errors.length) return errors.slice(0,50);
  const config = input as GameConfig;
  errors.push(...validateConfig(config));
  if (JSON.stringify(config.server) !== JSON.stringify(CONFIG.server)) errors.push('server is deployment-only and cannot be edited here');
  for (const pad of config.map.pickupPads) if (!['score','shotgun','heavy','speed','health'].includes(pad.kind)) errors.push('map.pickupPads contains an unsupported kind');
  if (config.map.width > 8192 || config.map.height > 8192) errors.push('map dimensions must not exceed 8192');
  if (config.network.maxPlayers > 64 || config.npc.maxCount > 128 || config.npc.targetPopulation > 192) errors.push('Player or NPC capacity exceeds editor safety bounds');
  if (config.network.tickMs < 5 || config.network.snapshotMs < 10 || config.network.inputMs < 5) errors.push('Network intervals are below editor safety bounds');
  for (const [name, weapon] of Object.entries(config.weapons)) if (weapon.pellets > 64 || weapon.cooldown < .01) errors.push('weapons.' + name + ' exceeds editor safety bounds');
  return errors.slice(0,50);
}
