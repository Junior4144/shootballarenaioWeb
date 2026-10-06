/** Decorative media only: deliberately has no game, identity or network imports. */
export class MenuBackground {
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private video?: HTMLVideoElement;
  private active = true;
  private failed = false;
  private disposed = false;
  constructor(private readonly host: HTMLElement) {
    this.motion.addEventListener('change', this.sync);
    document.addEventListener('visibilitychange', this.sync);
    this.sync();
  }
  setActive(active: boolean): void {
    this.active = active;
    this.host.hidden = !active;
    this.sync();
  }
  private release(): void {
    const video = this.video;
    this.video = undefined;
    if (!video) return;
    video.onplaying = video.onerror = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
  private sync = (): void => {
    if (this.disposed) return;
    if (!this.active || this.motion.matches || this.failed) { this.release(); return; }
    if (document.hidden) { this.video?.pause(); return; }
    if (!this.video) {
      const video = document.createElement('video');
      this.video = video;
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'none';
      video.tabIndex = -1;
      video.disablePictureInPicture = true;
      video.setAttribute('aria-hidden', 'true');
      video.onplaying = () => { if (this.video === video) video.classList.add('ready'); };
      video.onerror = () => this.fail(video);
      video.src = '/background/arena.mp4';
      this.host.append(video);
    }
    const video = this.video;
    void video.play().catch(error => {
      // A hide/release can cancel an outstanding play request without an autoplay failure.
      if (error?.name !== 'AbortError') this.fail(video);
    });
  };
  private fail(video: HTMLVideoElement): void {
    if (this.video !== video || this.disposed) return;
    this.failed = true;
    this.release();
  }
  destroy = (): void => {
    this.disposed = true;
    this.release();
    document.removeEventListener('visibilitychange', this.sync);
    this.motion.removeEventListener('change', this.sync);
  };
}
