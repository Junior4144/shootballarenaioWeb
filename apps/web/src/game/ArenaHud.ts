import type { Snapshot } from '@shootball/protocol';
import { GAME } from '@shootball/shared';
import { LOOP, WEAPONS, rankPlayers } from '@shootball/shared/content';
export const actorName = (id: string, localId?: string) => id === localId ? 'YOU' : id.startsWith('bot:') ? 'BOT ' + id.slice(4) : 'GUEST ' + id.slice(0, 4);
const element = (id: string) => document.getElementById(id)!;
const time = (seconds: number) => `${Math.floor(Math.ceil(seconds) / 60)}:${String(Math.ceil(seconds) % 60).padStart(2, '0')}`;
export class ArenaHud {
  private signature = '';
  private resultSignature = '';
  render(state: Snapshot, localId?: string): void {
    const humans = state.players.filter(p => !p.bot), me = humans.find(p => p.id === localId);
    const elapsed = time(Math.floor(Math.max(0, LOOP.matchSeconds - state.match.remaining)));
    element('match-clock').textContent = state.match.phase === 'playing' ? elapsed : 'RESULTS';
    element('match-target').textContent = `Target: ${state.match.scoreLimit} pts`;
    element('round-number').textContent = String(state.match.round);
    element('round-time').textContent = state.match.phase === 'playing' ? `${elapsed} / ${time(LOOP.matchSeconds)}` : 'Finished';
    element('round-target').textContent = `${state.match.scoreLimit} pts`;
    element('active-count').textContent = `${humans.filter(p => p.connected).length}/8 players`;
    const rows = rankPlayers(humans);
    const signature = JSON.stringify([localId, rows.map(p => [p.id, p.points, p.kills, p.botKills, p.connected, p.health > 0])]);
    if (signature !== this.signature) {
      this.signature = signature;
      element('scoreboard').replaceChildren(...rows.map(p => {
        const row = document.createElement('tr'); if (p.id === localId) row.className = 'local';
        for (const text of [actorName(p.id, localId) + (!p.connected ? ' (away)' : p.health <= 0 ? ' (down)' : ''), String(p.points), String(p.kills), String(p.botKills)]) {
          const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
        }
        return row;
      }));
    }
    const hp = Math.max(0, Math.min(GAME.playerHealth, me?.health ?? 0));
    element('health-value').textContent = me ? String(Math.ceil(hp)) : '—';
    element('health-fill').style.width = `${hp / GAME.playerHealth * 100}%`;
    element('health-meter').setAttribute('aria-valuemax', String(GAME.playerHealth));
    element('health-meter').setAttribute('aria-valuenow', String(hp));
    element('health-meter').classList.toggle('low', hp <= 25);
    element('loadout').textContent = me ? me.weapon.toUpperCase() : '—';
    element('ammo').textContent = !me ? '—' : me.weapon === 'basic' ? '∞' : `${me.ammo} / ${WEAPONS[me.weapon].ammo}`;
    element('ammo').setAttribute('aria-label', !me ? 'No weapon' : me.weapon === 'basic' ? 'Unlimited ammo' : `${me.ammo} of ${WEAPONS[me.weapon].ammo} shots`);
    element('speed').textContent = me && me.speedRemaining > 0 ? `ϟ SPD ${me.speedRemaining.toFixed(1)}s` : 'ϟ SPD';
    element('speed').classList.toggle('active', !!me && me.speedRemaining > 0);
    element('player-status').textContent = !me ? 'JOIN TO PLAY' : me.health <= 0
      ? `RESPAWN ${me.respawnRemaining.toFixed(1)}s`
      : me.protectionRemaining > 0 ? `SHIELD ${me.protectionRemaining.toFixed(1)}s` : '';
    const scan = element('scan') as HTMLButtonElement;
    scan.disabled = !me || me.health <= 0 || me.radarCooldown > 0 || state.match.phase !== 'playing';
    scan.textContent = me && me.radarCooldown > 0 ? `Q / Radar ${Math.ceil(me.radarCooldown)}s` : 'Q / Radar ready';
    const nearest = me?.radar.remaining ? [...me.radar.markers].sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0] : undefined;
    element('objective').textContent = state.match.phase === 'results' ? 'Next round starts automatically.' : nearest
      ? `Last scan: ${nearest.kind.toUpperCase()} / ${Math.round(Math.hypot(nearest.x - me!.x, nearest.y - me!.y))} units. Markers expire in ${Math.ceil(me!.radar.remaining)}s.`
      : me?.radar.remaining ? 'Scan clear. Explore another route.' : 'Collect orbs and upgrades. Scan for nearby opportunities.';
    const results = element('results'); results.hidden = state.match.phase !== 'results';
    if (!results.hidden) {
      element('rematch').textContent = `Next round in ${Math.ceil(state.match.remaining)}s`;
      const signature = JSON.stringify([state.match.round, state.match.standings, localId]);
      if (this.resultSignature !== signature) {
        this.resultSignature = signature;
        element('winner').textContent = !state.match.winnerIds.length ? 'No winner this round' : state.match.winnerIds.length > 1 ? 'Draw!' : actorName(state.match.winnerIds[0], localId) + ' wins!';
        element('final-standings').replaceChildren(...state.match.standings.map((p, i) => {
          const item = document.createElement('li'); item.textContent = `${i + 1}. ${actorName(p.id, localId)} / ${p.points} points / ${p.kills} PvP / ${p.botKills} bots`; return item;
        }));
      }
    }
    element('kill-feed').replaceChildren(...state.events.filter(e => e.kind === 'elimination').slice(-4).reverse().map(e => {
      const item = document.createElement('li');
      const actor = document.createElement('span'), target = document.createElement('span');
      actor.className = e.actorId === localId ? 'feed-local' : 'feed-actor';
      target.className = e.targetId === localId ? 'feed-local' : 'feed-target';
      actor.textContent = actorName(e.actorId, localId);
      target.textContent = actorName(e.targetId!, localId);
      item.append(actor, ' eliminated ', target); return item;
    }));
  }
}
