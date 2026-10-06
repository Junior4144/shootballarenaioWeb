/**
 * MASTER GAME CONFIG — edit tunable values here.
 * Distances: world pixels. Speeds: pixels/second. Times: seconds unless named Ms.
 * Shared by server and browser; rebuild/restart BOTH after editing. No secrets here.
 * Plain serializable data for a future settings editor; no runtime client overrides.
 * Map positions are absolute: resizing the map does not scale walls/spawns/pickups.
 */
export type WinCondition = 'points' | 'kills';
export type PickupKind = 'score' | 'shotgun' | 'heavy' | 'speed' | 'health';
export const CONFIG = {
  player: {
    health: 100, radius: 16, speed: 220,
    respawnSeconds: 3, spawnProtectionSeconds: 1.5,
  },
  npc: {
    enabled: true, health: 75, speed: 165, respawnSeconds: 4,
    // Fill toward targetPopulation, capped at maxCount; no bots without humans.
    maxCount: 4, targetPopulation: 6,
    shotDamage: 12, shotCooldownSeconds: 0.85,
    ai: {
      detectRange: 300, loseRange: 380, fireRange: 280, thinkSeconds: 0.2,
      routeSeconds: 0.9, searchSeconds: 2.5, spacing: 64,
      retreatRange: 110, retreatExitRange: 155,
      injuredHealth: 25, injuredRetreatRange: 230, injuredRetreatExitRange: 255,
      combatRangeHysteresis: 20, approachRange: 210, backoffRange: 160,
      combatForward: 0.4, chaseStrafe: 0.15, combatStrafe: 0.65,
      goalArrivalRadius: 18, waypointArrivalRadius: 10, patrolMinDistance: 80,
      stalledDistance: 8, separationStrength: 2, separationGap: 2,
      separationPasses: 4, separationDirections: 8,
    },
  },
  match: {
    durationSeconds: 300, resultsSeconds: 10,
    // 'points': first to scoreLimit. 'kills': first to killsToWin (human kills only).
    // Timer always ends the round; rankings/winners use the selected metric.
    winCondition: 'points' as WinCondition, scoreLimit: 1000, killsToWin: 10,
    humanKillPoints: 100, npcKillPoints: 20, orbPoints: 5,
  },
  weapons: {
    // cooldown/life are seconds, spread is radians; basic ammo 0 means unlimited.
    basic: { damage: 25, cooldown: 0.15, speed: 520, life: 1.2, pellets: 1, spread: 0, ammo: 0 },
    shotgun: { damage: 12, cooldown: 0.6, speed: 450, life: 0.65, pellets: 5, spread: 0.24, ammo: 8 },
    heavy: { damage: 50, cooldown: 0.55, speed: 650, life: 1, pellets: 1, spread: 0, ammo: 6 },
  },
  projectile: { radius: 4, muzzleOffset: 28 },
  pickups: {
    collectRadius: 28, placementRadius: 12, healAmount: 35,
    scoreRespawnSeconds: 8, upgradeRespawnSeconds: 15,
    speedDurationSeconds: 6, speedMultiplier: 1.25,
    npcDrops: { offsetsX: [-10, 10], maxCount: 32, lifetimeSeconds: 12, placementRadius: 8 },
  },
  radar: { cooldownSeconds: 12, durationSeconds: 3, range: 360 },
  map: {
    // Playable width/height, independent of the viewport below.
    left: 48, top: 80, width: 1296, height: 768,
    cameraPadding: 48, gridSize: 32,
    walls: [
      { x: 280, y: 220, width: 64, height: 128 },
      { x: 616, y: 324, width: 64, height: 128 },
      { x: 432, y: 200, width: 96, height: 48 },
      { x: 432, y: 424, width: 96, height: 48 },
      { x: 168, y: 400, width: 80, height: 48 },
      { x: 712, y: 224, width: 80, height: 48 },
      { x: 1000, y: 200, width: 64, height: 128 },
      { x: 1120, y: 440, width: 112, height: 48 },
      { x: 880, y: 584, width: 64, height: 128 },
      { x: 576, y: 664, width: 128, height: 48 },
      { x: 280, y: 624, width: 64, height: 128 },
    ],
    spawns: [
      { x: 144, y: 160 }, { x: 816, y: 512 }, { x: 816, y: 160 }, { x: 144, y: 512 },
      { x: 480, y: 128 }, { x: 480, y: 544 }, { x: 112, y: 336 }, { x: 848, y: 336 },
      { x: 1232, y: 160 }, { x: 1232, y: 752 }, { x: 1056, y: 624 },
      { x: 752, y: 784 }, { x: 144, y: 752 },
    ],
    pickupPads: [
      { x: 1168, y: 336, kind: 'shotgun' }, { x: 1056, y: 752, kind: 'heavy' },
      { x: 480, y: 768, kind: 'speed' }, { x: 1232, y: 592, kind: 'health' },
      { x: 752, y: 656, kind: 'health' },
      { x: 944, y: 128, kind: 'score' }, { x: 1232, y: 240, kind: 'score' }, { x: 1040, y: 432, kind: 'score' },
        { x: 1232, y: 752, kind: 'score' }, { x: 800, y: 784, kind: 'score' }, { x: 384, y: 656, kind: 'score' }, { x: 144, y: 752, kind: 'score' },
      { x: 480, y: 336, kind: 'shotgun' }, { x: 816, y: 336, kind: 'heavy' },
      { x: 144, y: 336, kind: 'speed' }, { x: 376, y: 336, kind: 'health' },
      { x: 584, y: 336, kind: 'health' },
      { x: 208, y: 160, kind: 'score' }, { x: 752, y: 512, kind: 'score' }, { x: 376, y: 160, kind: 'score' }, { x: 584, y: 512, kind: 'score' },
        { x: 480, y: 288, kind: 'score' }, { x: 480, y: 384, kind: 'score' }, { x: 112, y: 256, kind: 'score' }, { x: 848, y: 416, kind: 'score' },
    ] as { x: number; y: number; kind: PickupKind }[],
  },
  practiceTargets: {
    // Legacy target drill: health is hits to destroy, not PvP damage points.
    health: 3, radius: 20, damagePerHit: 1,
    playerSpawn: { x: 240, y: 336 },
    positions: [{ x: 530, y: 220 }, { x: 740, y: 220 }, { x: 530, y: 450 }, { x: 740, y: 450 }],
  },
  simulation: {
    maxStepSeconds: 0.05, maxCatchUpTicks: 3,
    eventHistoryLimit: 128, eventRetentionSeconds: 4,
    navigationCornerPadding: 3, navigationClearance: 1,
  },
  network: {
    maxPlayers: 8, tickMs: 1000 / 60, snapshotMs: 50, inputMs: 1000 / 30,
    inputTimeoutMs: 250, reconnectSeconds: 10,
    maxMessagesPerSecond: 60, roomMaxMessagesPerSecond: 120, maxPayload: 1024,
    pingInterval: 1000, pingMaxRetries: 2,
    interpolationDelayMs: 100, interpolationMaxGapMs: 250, interpolationMaxSnapshots: 12,
    reconnectMinDelayMs: 250, reconnectMaxDelayMs: 1000, reconnectMaxRetries: 40,
  },
  server: { host: '127.0.0.1', port: 2567 }, // GAME_SERVER_PORT overrides port.
  presentation: {
    viewport: { width: 960, height: 640, topInset: 80, bottomInset: 48, sideInset: 48 },
    cameraEaseMs: 110, cameraOffsetY: 16,
    lowHealthFraction: 0.25, killFeedCount: 4,
    eventMaxAgeSeconds: 0.5, effectMs: 160, eliminationEffectMs: 450, audioRange: 600,
    audio: {
      volume: 0.025, endVolume: 0.001,
      // [start frequency Hz, end frequency Hz, duration seconds]
      tones: { shot: [220, 90, 0.055], hit: [700, 400, 0.08], elimination: [180, 45, 0.22], pickup: [500, 950, 0.12] },
    },
  },
};
export type GameConfig = typeof CONFIG;
