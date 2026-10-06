import type { GameConfig } from './config';

/** Validate a typed editor draft before saving. Returns field paths for inline errors. */
export function validateConfig(config: GameConfig): string[] {
  const errors: string[] = [];
  const check = (ok: boolean, message: string) => { if (!ok) errors.push(message); };
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'number') {
      check(Number.isFinite(value), `${path} must be finite`);
      if (!path.startsWith('pickups.npcDrops.offsetsX.') && path !== 'presentation.cameraOffsetY') {
        check(value >= 0, `${path} must be nonnegative`);
      }
    }
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(config, '');
  const sprint = config.player.sprint;
  check(sprint.speedMultiplier > 1, 'player.sprint.speedMultiplier must exceed 1');
  check(sprint.maxStamina > 0 && sprint.drainPerSecond > 0 && sprint.regenPerSecond > 0,
    'player.sprint stamina capacity, drain and regeneration must be positive');
  check(sprint.resumeStamina > 0 && sprint.resumeStamina <= sprint.maxStamina,
    'player.sprint.resumeStamina must be positive and no greater than maxStamina');
  const positive = (values: Record<string, number>) => {
    for (const [path, value] of Object.entries(values)) check(value > 0, `${path} must be greater than zero`);
  };
  positive({
    'player.health': config.player.health, 'player.radius': config.player.radius,
    'npc.health': config.npc.health, 'npc.shotCooldownSeconds': config.npc.shotCooldownSeconds,
    'npc.ai.spacing': config.npc.ai.spacing, 'npc.ai.thinkSeconds': config.npc.ai.thinkSeconds,
    'npc.ai.routeSeconds': config.npc.ai.routeSeconds,
    'match.scoreLimit': config.match.scoreLimit, 'match.killsToWin': config.match.killsToWin,
    'map.width': config.map.width, 'map.height': config.map.height, 'map.gridSize': config.map.gridSize,
    'projectile.radius': config.projectile.radius,
    'simulation.maxStepSeconds': config.simulation.maxStepSeconds,
    'network.tickMs': config.network.tickMs, 'network.snapshotMs': config.network.snapshotMs,
    'network.inputMs': config.network.inputMs, 'network.interpolationMaxGapMs': config.network.interpolationMaxGapMs,
    'presentation.cameraEaseMs': config.presentation.cameraEaseMs,
    'presentation.effectMs': config.presentation.effectMs,
  });
  for (const [path, value] of Object.entries({
    'npc.maxCount': config.npc.maxCount, 'npc.targetPopulation': config.npc.targetPopulation,
    'pickups.npcDrops.maxCount': config.pickups.npcDrops.maxCount,
  })) check(Number.isInteger(value) && value >= 0, `${path} must be a nonnegative integer`);
  for (const [path, value] of Object.entries({
    'network.maxPlayers': config.network.maxPlayers,
    'network.maxMessagesPerSecond': config.network.maxMessagesPerSecond,
    'network.roomMaxMessagesPerSecond': config.network.roomMaxMessagesPerSecond,
    'network.maxPayload': config.network.maxPayload,
    'match.killsToWin': config.match.killsToWin,
    'simulation.eventHistoryLimit': config.simulation.eventHistoryLimit,
    'simulation.maxCatchUpTicks': config.simulation.maxCatchUpTicks,
    'npc.ai.separationPasses': config.npc.ai.separationPasses,
    'npc.ai.separationDirections': config.npc.ai.separationDirections,
    'presentation.killFeedCount': config.presentation.killFeedCount,
  })) check(Number.isInteger(value) && value > 0, `${path} must be a positive integer`);
  check(['points', 'kills'].includes(config.match.winCondition), 'match.winCondition must be points or kills');
  const variation = config.npc.ai.variation;
  check(variation.thinkJitter < 1 && variation.strafeStrengthJitter <= 1,
    'npc.ai.variation.thinkJitter must be below 1 and strafeStrengthJitter at most 1');
  check(variation.maneuverMinSeconds > 0 && variation.maneuverMaxSeconds >= variation.maneuverMinSeconds,
    'npc.ai.variation maneuver times must be positive and ordered min <= max');
  check(Number.isInteger(variation.patrolHistory) && variation.patrolHistory > 0,
    'npc.ai.variation.patrolHistory must be a positive integer');
  check(Number.isInteger(variation.patrolPointAttempts) && variation.patrolPointAttempts > 0,
    'npc.ai.variation.patrolPointAttempts must be a positive integer');
  check(config.network.tickMs / 1000 <= config.simulation.maxStepSeconds,
    'network.tickMs must not exceed simulation.maxStepSeconds * 1000');
  check(Number.isInteger(config.network.interpolationMaxSnapshots) && config.network.interpolationMaxSnapshots >= 2,
    'network.interpolationMaxSnapshots must be an integer of at least 2');
  check(config.network.reconnectMinDelayMs > 0 && config.network.reconnectMaxDelayMs >= config.network.reconnectMinDelayMs,
    'network reconnect delays must be positive and ordered min <= max');
  check(config.server.port >= 1 && config.server.port <= 65535 && Number.isInteger(config.server.port),
    'server.port must be an integer from 1 to 65535');
  const viewport = config.presentation.viewport;
  check(viewport.sideInset >= 0 && viewport.width > viewport.sideInset * 2,
    'presentation.viewport.width must exceed twice sideInset');
  check(viewport.topInset >= 0 && viewport.bottomInset >= 0 && viewport.height > viewport.topInset + viewport.bottomInset,
    'presentation.viewport.height must exceed topInset + bottomInset');
  check(config.presentation.lowHealthFraction >= 0 && config.presentation.lowHealthFraction <= 1,
    'presentation.lowHealthFraction must be between 0 and 1');
  for (const [name, weapon] of Object.entries(config.weapons)) {
    positive({ [`weapons.${name}.cooldown`]: weapon.cooldown, [`weapons.${name}.life`]: weapon.life });
    check(weapon.damage >= 0 && weapon.speed >= 0 && weapon.spread >= 0, `weapons.${name} damage, speed and spread must be nonnegative`);
    check(Number.isInteger(weapon.pellets) && weapon.pellets > 0, `weapons.${name}.pellets must be a positive integer`);
    check(Number.isInteger(weapon.ammo) && (name === 'basic' ? weapon.ammo === 0 : weapon.ammo > 0),
      `weapons.${name}.ammo must be ${name === 'basic' ? '0 (unlimited)' : 'a positive integer'}`);
  }
  const map = config.map, radius = config.player.radius;
  check(map.left >= 0 && map.top >= 0, 'map.left and map.top must be nonnegative');
  for (const [i, wall] of map.walls.entries()) {
    check(wall.width > 0 && wall.height > 0, `map.walls.${i} dimensions must be positive`);
    check(wall.x >= map.left && wall.y >= map.top && wall.x + wall.width <= map.left + map.width
      && wall.y + wall.height <= map.top + map.height, `map.walls.${i} must fit inside the map`);
  }
  check(map.spawns.length > 0, 'map.spawns must contain at least one spawn');
  for (const [i, point] of map.spawns.entries()) {
    check(point.x >= map.left + radius && point.x <= map.left + map.width - radius
      && point.y >= map.top + radius && point.y <= map.top + map.height - radius,
    `map.spawns.${i} must fit inside the map with player.radius clearance`);
  }
  check(map.spawns.some(point => point.x >= map.left + radius && point.x <= map.left + map.width - radius
    && point.y >= map.top + radius && point.y <= map.top + map.height - radius
    && map.walls.every(wall => point.x < wall.x - radius || point.x > wall.x + wall.width + radius
      || point.y < wall.y - radius || point.y > wall.y + wall.height + radius)),
  'map.spawns must include a spawn clear of walls');
  return errors;
}
