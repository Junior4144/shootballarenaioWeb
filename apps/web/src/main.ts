import Phaser from 'phaser';
import { GAME } from '@shootball/shared';
import { ArenaScene } from './game/ArenaScene';
import { attachGameplayHeader } from './game/GameplayHeader';
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
const detachHoverAudio = attachHoverAudio(document.body);
if (import.meta.hot) import.meta.hot.dispose(detachHoverAudio);
const arena = document.getElementById('arena-app')!;
const header = attachGameplayHeader();
if (import.meta.hot) import.meta.hot.dispose(header.destroy);
function stop(): void {
  header.close();
  scene?.connection?.endIdentity();
  // Phaser destroys on its next frame; remove the scene now so a new game cannot overlap.
  if (game) { game.scene.stop('arena'); game.scene.remove('arena'); game.destroy(true); }
  game = undefined; scene = undefined;
  arena.hidden = true; screen.hidden = false;
}
function play(identity: PlayIdentity): void {
  if (game) return;
  document.getElementById('game-loading')!.hidden = false;
  document.getElementById('game-loading-message')!.textContent = 'Entering the arena...';
  screen.hidden = true; arena.hidden = false;
  document.getElementById('playing-identity')!.textContent = identity.kind === 'guest' ? 'GUEST / Temporary' : document.getElementById('account-identity')!.textContent;
  const label = identity.kind === 'guest' ? 'GUEST' : (document.getElementById('display-name') as HTMLInputElement).value;
  document.getElementById('account-toggle-name')!.textContent = label;
  document.getElementById('account-toggle')!.title = identity.kind === 'guest' ? 'Guest account options' : `Account: ${label}`;
  document.getElementById('return-accounts')!.textContent = identity.kind === 'guest' ? 'Log in' : 'Manage account';
  document.getElementById('gameplay-signup')!.hidden = identity.kind !== 'guest';
  const nextScene = new ArenaScene(identity, () => {
    if (scene === nextScene) document.getElementById('game-loading')!.hidden = true;
  });
  scene = nextScene;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME.width,
    height: GAME.height,
    backgroundColor: '#131e2a',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE },
    scene,
  });
}
const accounts = new AccountScreen(play, stop, () => { void scene?.connection?.refreshAccount(); });
document.getElementById('return-accounts')!.onclick = () => accounts.open('login');
document.getElementById('gameplay-signup')!.onclick = () => accounts.open('signup');
document.getElementById('cancel-game-loading')!.onclick = () => accounts.open('login');
