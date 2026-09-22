const steps = [
  {
    title: 'Open a pull request',
    detail: 'Open a PR in your theme repository. Proof takes it from here.',
  },
  {
    title: 'Build your theme',
    detail:
      'Your build commands, without Shopify credentials. Or no build at all.',
  },
  {
    title: 'Deploy a preview',
    detail:
      'Validated theme files become a development preview. Your live theme stays untouched.',
  },
  {
    title: 'Review it in GitHub',
    detail:
      'One comment, updated on every push. The preview is removed when you close the PR.',
  },
];
const durations = [2400, 2800, 2600];

export function createPreviewDemo(root: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cleanup = () => {};
  let destroyed = false;

  return {
    step: 3,
    playing: false,
    reducedMotion: true,
    hidden: false,
    visible: true,
    announcement: '',
    get running() {
      return (
        this.playing && !this.reducedMotion && !this.hidden && this.visible
      );
    },
    get detail() {
      return steps[this.step].detail;
    },
    get controlLabel() {
      return this.step === 3
        ? 'Replay walkthrough'
        : this.playing
          ? 'Pause walkthrough'
          : 'Play walkthrough';
    },
    init() {
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = motion.matches;
      this.hidden = document.hidden;
      if (!this.reducedMotion) {
        this.step = 0;
        this.playing = true;
      }
      const visibility = () => {
        this.hidden = document.hidden;
        this.schedule();
      };
      const preference = () => {
        this.reducedMotion = motion.matches;
        if (this.reducedMotion) {
          this.playing = false;
          this.step = 3;
          this.announcement = '';
        }
        this.schedule();
      };
      const observer =
        typeof IntersectionObserver === 'undefined'
          ? undefined
          : new IntersectionObserver(([entry]) => {
              this.visible = entry.isIntersecting;
              this.schedule();
            });
      observer?.observe(root);
      document.addEventListener('visibilitychange', visibility);
      motion.addEventListener('change', preference);
      cleanup = () => {
        document.removeEventListener('visibilitychange', visibility);
        motion.removeEventListener('change', preference);
        observer?.disconnect();
      };
      this.schedule();
    },
    schedule() {
      clearTimeout(timer);
      if (destroyed || !this.running || this.step === 3) return;
      timer = setTimeout(() => {
        this.step += 1;
        if (this.step === 3) this.playing = false;
        this.schedule();
      }, durations[this.step]);
    },
    select(step: number) {
      if (
        destroyed ||
        !Number.isInteger(step) ||
        step < 0 ||
        step >= steps.length
      )
        return;
      this.step = step;
      this.playing = false;
      this.announcement = `Step ${step + 1}: ${steps[step].title}. ${steps[step].detail}`;
      this.schedule();
    },
    toggle() {
      if (destroyed || this.reducedMotion) return;
      if (this.step === 3) this.step = 0;
      this.announcement = '';
      this.playing = !this.playing;
      this.schedule();
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      cleanup();
    },
  };
}
