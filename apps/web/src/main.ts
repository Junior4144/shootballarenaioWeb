import Phaser from 'phaser';
import { GAME } from '@shootball/shared';
import { ArenaScene } from './game/ArenaScene';
import './style.css';
import { AccountScreen } from './auth/AccountScreen';
import { attachHoverAudio } from './auth/hoverAudio';
import type { PlayIdentity } from './network/PracticeConnection';

const helpWidget = document.querySelector<HTMLDetailsElement>('#help-widget')!;
document.getElementById('help-close')!.addEventListener('click', () => {
  helpWidget.open = false;
  helpWidget.querySelector('summary')!.focus();
});

let game: Phaser.Game | undefined;
let scene: ArenaScene | undefined;
const screen = document.getElementById('account-screen')!;
const detachHoverAudio = attachHoverAudio(screen);
if (import.meta.hot) import.meta.hot.dispose(detachHoverAudio);
const arena = document.getElementById('arena-app')!;
function stop(): void {
  scene?.connection?.endIdentity();
  // Phaser destroys on its next frame; remove the scene now so a new game cannot overlap.
  if (game) { game.scene.stop('arena'); game.scene.remove('arena'); game.destroy(true); }
  game = undefined; scene = undefined;
  arena.hidden = true; screen.hidden = false;
}
function play(identity: PlayIdentity): void {
  if (game) return;
  screen.hidden = true; arena.hidden = false;
  document.getElementById('playing-identity')!.textContent = identity.kind === 'guest' ? 'GUEST / Temporary' : document.getElementById('account-identity')!.textContent;
  scene = new ArenaScene(identity);
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME.width,
    height: GAME.height,
    backgroundColor: '#131e2a',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene,
  });
}
new AccountScreen(play, stop, () => { void scene?.connection?.refreshAccount(); });
document.getElementById('return-accounts')!.onclick = stop;
