import { NETWORK, type Snapshot } from '@shootball/protocol';
import { CONFIG, GAME } from '@shootball/shared';
import { WEAPONS, rankPlayers } from '@shootball/shared/content';
export const actorName = (id: string, localId?: string, identities?: Snapshot['identities']) => id === localId ? (identities?.[id]?.kind === 'account' ? 'YOU / ACCOUNT' : 'YOU') : id.startsWith('bot:') ? 'BOT ' + id.slice(4) : identities?.[id]?.kind === 'account' ? 'ACCOUNT / ' + identities[id].displayName : 'GUEST ' + id.slice(0, 4);
const element = (id: string) => document.getElementById(id)!;
const time = (seconds: number) => `${Math.floor(Math.ceil(seconds) / 60)}:${String(Math.ceil(seconds) % 60).padStart(2, '0')}`;
export class ArenaHud {
  private signature = '';
  private resultSignature = '';
  render(state: Snapshot, localId?: string): void {
    const humans = state.players.filter(p => !p.bot), me = humans.find(p => p.id === localId);
    const stamina = Math.max(0, Math.min(CONFIG.player.sprint.maxStamina, me?.stamina ?? 0));
    element('stamina').hidden = !me?.sprinting || !me.connected || me.health <= 0 || state.match.phase !== 'playing';
    element('stamina-fill').style.width = `${stamina / CONFIG.player.sprint.maxStamina * 100}%`;
    element('stamina-meter').setAttribute('aria-valuemax', String(CONFIG.player.sprint.maxStamina));
    element('stamina-meter').setAttribute('aria-valuenow', String(Math.round(stamina)));
    const elapsed = time(Math.floor(Math.max(0, state.match.elapsedSeconds)));
    element('match-clock').textContent = state.match.phase === 'playing' ? elapsed : 'RESULTS';
    const target = state.match.winCondition === 'kills' ? `${state.match.killsToWin} kills` : `${state.match.scoreLimit} pts`;
    element('match-target').textContent = `Target: ${target}`;

    element('round-time').textContent = state.match.phase === 'playing' ? elapsed : 'Finished';
    element('round-target').textContent = target;
    element('active-count').textContent = `${humans.filter(p => p.connected).length}/${NETWORK.maxPlayers} players`;
    const rows = rankPlayers(humans, state.match.winCondition);
    const signature = JSON.stringify([localId, state.identities, rows.map(p => [p.id, p.points, p.kills, p.botKills, p.connected, p.health > 0])]);
    if (signature !== this.signature) {
      this.signature = signature;
      element('scoreboard').replaceChildren(...rows.map(p => {
        const row = document.createElement('tr'); if (p.id === localId) row.className = 'local';
        for (const text of [actorName(p.id, localId, state.identities) + (!p.connected ? ' (away)' : p.health <= 0 ? ' (down)' : ''), String(p.points), String(p.kills), String(p.botKills)]) {
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
    element('health-meter').classList.toggle('low', hp <= GAME.playerHealth * CONFIG.presentation.lowHealthFraction);
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
    element('objective').textContent = state.match.phase === 'results' ? 'Match complete. Return to the main menu to play again.' : nearest
      ? `Last scan: ${nearest.kind.toUpperCase()} / ${Math.round(Math.hypot(nearest.x - me!.x, nearest.y - me!.y))} units. Markers expire in ${Math.ceil(me!.radar.remaining)}s.`
      : me?.radar.remaining ? 'Scan clear. Explore another route.' : 'Collect orbs and upgrades. Scan for nearby opportunities.';
    const results = element('results'); results.hidden = state.match.phase !== 'results';
    if (!results.hidden) {
      const position = state.match.standings.findIndex(player => player.id === localId);
      element('rematch').textContent = position >= 0 ? `YOUR POSITION: #${position + 1} OF ${state.match.standings.length}` : 'Match complete';
      const signature = JSON.stringify([state.match.standings, localId, state.identities]);
      if (this.resultSignature !== signature) {
        this.resultSignature = signature;
        const localWinner = !!localId && state.match.winnerIds.includes(localId);
        results.dataset.outcome = !state.match.winnerIds.length ? 'empty' : state.match.winnerIds.length > 1 ? 'draw' : localWinner ? 'win' : 'loss';
        element('winner').textContent = !state.match.winnerIds.length ? 'No winner this match' : state.match.winnerIds.length > 1 ? 'Draw!' : localWinner ? 'VICTORY!' : actorName(state.match.winnerIds[0], localId, state.identities) + ' wins!';
        element('final-standings').replaceChildren(...state.match.standings.map((p, i) => {
          const item = document.createElement('li');
          if (p.id === localId) item.className = 'local';
          const rank = document.createElement('span'), name = document.createElement('strong');
          const points = document.createElement('span'), kills = document.createElement('span');
          rank.className = 'result-rank'; rank.textContent = String(i + 1).padStart(2, '0');
          name.className = 'result-name'; name.textContent = actorName(p.id, localId, state.identities);
          points.className = 'result-points'; points.textContent = `${p.points} PTS`;
          kills.className = 'result-kills'; kills.textContent = `${p.kills} PvP / ${p.botKills} bots`;
          item.append(rank, name, points, kills); return item;
        }));
      }
    }
    element('kill-feed').replaceChildren(...state.events.filter(e => e.kind === 'elimination').slice(-CONFIG.presentation.killFeedCount).reverse().map(e => {
      const item = document.createElement('li');
      const actor = document.createElement('span'), target = document.createElement('span');
      actor.className = e.actorId === localId ? 'feed-local' : 'feed-actor';
      target.className = e.targetId === localId ? 'feed-local' : 'feed-target';
      actor.textContent = actorName(e.actorId, localId, state.identities);
      target.textContent = actorName(e.targetId!, localId, state.identities);
      item.append(actor, ' eliminated ', target); return item;
    }));
  }
}
