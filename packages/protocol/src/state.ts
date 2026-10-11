import { MapSchema, Schema, schema, t } from '@colyseus/schema';
import type { Snapshot } from './index';

// Preserve JS numeric precision; automatic number encoding may choose float32.
const PointState = schema({ x: t.float64(), y: t.float64() }, 'ArenaPoint');
const MarkerState = schema({ order: t.number(), id: t.string(), kind: t.string(), x: t.float64(), y: t.float64() }, 'ArenaMarker');
const RadarState = schema({ remaining: t.float64(), origin: t.ref(PointState), markers: t.map(MarkerState) }, 'ArenaRadar');
const playerFields = {
  id: t.string(), connected: t.boolean(), bot: t.boolean(), x: t.float64(), y: t.float64(), angle: t.float64(),
  health: t.float64(), kills: t.float64(), botKills: t.float64(), deaths: t.float64(), points: t.float64(),
  stamina: t.float64(), sprinting: t.boolean(), respawnRemaining: t.float64(), protectionRemaining: t.float64(),
  lifeId: t.float64(), weapon: t.string(), ammo: t.float64(), speedRemaining: t.float64(), radarCooldown: t.float64(),
};
const PlayerState = schema({ order: t.number(), ...playerFields, radar: t.ref(RadarState) }, 'ArenaPlayer');
const shotFields = { id: t.float64(), x: t.float64(), y: t.float64(), vx: t.float64(), vy: t.float64(), life: t.float64(), ownerId: t.string(), damage: t.float64() };
const ShotState = schema({ order: t.number(), ...shotFields }, 'ArenaShot');
const pickupFields = { id: t.float64(), x: t.float64(), y: t.float64(), kind: t.string(), available: t.boolean(), respawnRemaining: t.float64(), dropped: t.boolean(), lifetime: t.float64() };
const PickupState = schema({ order: t.number(), ...pickupFields }, 'ArenaPickup');
const targetFields = { id: t.float64(), x: t.float64(), y: t.float64(), health: t.float64() };
const TargetState = schema({ order: t.number(), ...targetFields }, 'ArenaTarget');
const eventFields = {
  id: t.float64(), time: t.float64(), x: t.float64(), y: t.float64(), kind: t.string(), actorId: t.string(),
  targetId: t.string().optional(), targetBot: t.boolean().optional(), value: t.float64().optional(),
};
const EventState = schema({ order: t.number(), ...eventFields }, 'ArenaEvent');
const standingFields = { id: t.string(), points: t.float64(), kills: t.float64(), botKills: t.float64(), deaths: t.float64() };
const StandingState = schema({ order: t.number(), ...standingFields }, 'ArenaStanding');
const matchFields = { phase: t.string(), elapsedSeconds: t.float64(), scoreLimit: t.float64(), winCondition: t.string(), killsToWin: t.float64() };
const MatchState = schema({ ...matchFields, winnerIds: t.map('string'), standings: t.map(StandingState) }, 'ArenaMatch');
const IdentityState = schema({ kind: t.string(), displayName: t.string().optional() }, 'ArenaIdentity');

export const ArenaState = schema({
  tick: t.float64(), generation: t.float64(), time: t.float64(),
  players: t.map(PlayerState), projectiles: t.map(ShotState), pickups: t.map(PickupState),
  targets: t.map(TargetState), events: t.map(EventState), match: t.ref(MatchState),
  identities: t.map(IdentityState),
}, 'ArenaState');
export type ArenaState = InstanceType<typeof ArenaState>;

// Only declared public fields are copied. Optional fields are explicitly cleared.
function scalars<T extends object, S extends object>(target: T, source: S, fields: object): void {
  for (const key of Object.keys(fields)) {
    (target as Record<string, unknown>)[key] = (source as Record<string, unknown>)[key];
  }
}

// Preserve entity references across patches, including removal and reordering.
function entities<T extends Schema & { id: string | number; order: number }, S extends { id: string | number }>(
  target: MapSchema<T>, source: S[], make: () => T, update: (target: T, source: S) => void,
): void {
  const wanted = new Set(source.map(value => String(value.id)));
  for (const id of target.keys()) if (!wanted.has(id)) target.delete(id);
  source.forEach((value, order) => {
    const id = String(value.id);
    let entity = target.get(id);
    if (!entity) { entity = make(); target.set(id, entity); }
    update(entity, value);
    entity.order = order;
  });
}

/** Reconcile a public simulation snapshot into long-lived tracked state. */
export function updateArenaState(state: ArenaState, snapshot: Snapshot): void {
  scalars(state, snapshot, { tick: 0, generation: 0, time: 0 });
  entities(state.players, snapshot.players, () => new PlayerState(), (player, source) => {
    scalars(player, source, playerFields);
    player.radar.remaining = source.radar.remaining;
    scalars(player.radar.origin, source.radar.origin, { x: 0, y: 0 });
    entities(player.radar.markers, source.radar.markers, () => new MarkerState(), (marker, value) => scalars(marker, value, { id: 0, kind: 0, x: 0, y: 0 }));
  });
  entities(state.projectiles, snapshot.projectiles, () => new ShotState(), (a, b) => scalars(a, b, shotFields));
  entities(state.pickups, snapshot.pickups, () => new PickupState(), (a, b) => scalars(a, b, pickupFields));
  entities(state.targets, snapshot.targets, () => new TargetState(), (a, b) => scalars(a, b, targetFields));
  entities(state.events, snapshot.events, () => new EventState(), (a, b) => scalars(a, b, eventFields));
  scalars(state.match, snapshot.match, matchFields);
  const winners = state.match.winnerIds;
  for (const key of winners.keys()) if (Number(key) >= snapshot.match.winnerIds.length) winners.delete(key);
  snapshot.match.winnerIds.forEach((id, index) => winners.set(String(index), id));
  entities(state.match.standings, snapshot.match.standings, () => new StandingState(), (a, b) => scalars(a, b, standingFields));
  const identities = snapshot.identities ?? {};
  for (const id of state.identities.keys()) if (!Object.hasOwn(identities, id)) state.identities.delete(id);
  for (const [id, identity] of Object.entries(identities)) {
    let value = state.identities.get(id);
    if (!value) { value = new IdentityState(); state.identities.set(id, value); }
    scalars(value, identity, { kind: 0, displayName: 0 });
  }
}

/** Fresh plain objects are essential: the interpolation buffer keeps old frames. */
export function snapshotFromState(state: ArenaState): Snapshot {
  const value = state.toJSON();
  const ordered = <T extends { order: number }>(items: Record<string, T>) =>
    Object.values(items).sort((a, b) => a.order - b.order).map(({ order: _order, ...item }) => item);
  return {
    ...value,
    players: ordered(value.players).map(player => ({ ...player, radar: { ...player.radar, markers: ordered(player.radar.markers) } })),
    projectiles: ordered(value.projectiles), pickups: ordered(value.pickups),
    targets: ordered(value.targets), events: ordered(value.events),
    match: { ...value.match, standings: ordered(value.match.standings), winnerIds: Object.values(value.match.winnerIds) },
  } as Snapshot;
}

/** Shared by the browser, integration tests, and operational smoke clients. */
export function observeSnapshots(
  room: { state: unknown; onStateChange: (callback: (state: unknown) => void) => unknown },
  callback: (snapshot: Snapshot) => void,
): void {
  room.onStateChange(state => callback(snapshotFromState(state as ArenaState)));
  // The initial full state may already have arrived before listener registration.
  const initial = room.state as ArenaState | undefined;
  if (initial?.players?.size) callback(snapshotFromState(initial));
}
