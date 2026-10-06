import type { Snapshot } from '@shootball/protocol';
import { rankPlayers } from '@shootball/shared/content';
export const actorName = (id: string, localId?: string) => id === localId ? 'YOU' : id.startsWith('bot:') ? 'BOT ' + id.slice(4) : 'GUEST ' + id.slice(0, 4);
const element = (id: string) => document.getElementById(id)!;
const time = (seconds: number) => `${Math.floor(Math.ceil(seconds) / 60)}:${String(Math.ceil(seconds) % 60).padStart(2, '0')}`;
export class ArenaHud {
  private signature = '';
  private resultSignature = '';
  render(state: Snapshot, localId?: string): void {
    const humans = state.players.filter(p => !p.bot), me = humans.find(p => p.id === localId);
    element('match-clock').textContent = `ROUND ${state.match.round} / ${time(state.match.remaining)} / ${state.match.scoreLimit} PTS`;
    element('active-count').textContent = `${humans.filter(p => p.connected).length} active players / ${state.players.filter(p => p.bot).length} bots`;
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
    element('loadout').textContent = !me ? 'Join to play' : `${me.weapon === 'basic' ? 'BASIC / unlimited' : me.weapon.toUpperCase() + ' / ' + me.ammo + ' shots'}${me.speedRemaining > 0 ? ' / SPEED ' + me.speedRemaining.toFixed(1) + 's' : ''}`;
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
      const item = document.createElement('li'); item.textContent = `${actorName(e.actorId, localId)} eliminated ${actorName(e.targetId!, localId)}`; return item;
    }));
  }
}
