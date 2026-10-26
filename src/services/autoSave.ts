export type SavePhase = 'saved' | 'pending' | 'saving' | 'error';

export interface SaveStatus {
  phase: SavePhase;
  dirty: boolean;
  error: string | null;
}

export class AutoSave {
  private revision = 0;
  private savedRevision = 0;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<boolean> | null = null;
  private disposed = false;

  constructor(
    private readonly save: () => Promise<void>,
    private readonly onStatus: (status: SaveStatus) => void,
    private readonly formatError: (error: unknown) => string,
    private readonly debounceMs = 800,
  ) {
    this.report('saved');
  }

  private report(phase: SavePhase, error: string | null = null) {
    if (this.disposed) return;
    this.onStatus({ phase, dirty: this.revision > this.savedRevision, error });
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delay: number) {
    this.clearTimer();
    if (this.disposed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  changed() {
    if (this.disposed) return;
    this.revision += 1;
    this.report(this.running ? 'saving' : 'pending');
    this.schedule(this.debounceMs);
  }

  private saveOnce(): Promise<boolean> {
    if (this.running) return this.running;
    const version = this.revision;
    this.report('saving');
    const task = Promise.resolve()
      .then(() => this.save())
      .then(() => {
        this.savedRevision = version;
        this.failures = 0;
        if (this.revision === version) this.report('saved');
        else {
          this.report('pending');
          this.schedule(this.debounceMs);
        }
        return true;
      })
      .catch((error: unknown) => {
        this.failures += 1;
        this.report('error', this.formatError(error));
        this.schedule(Math.min(30000, 2000 * 2 ** Math.min(this.failures - 1, 4)));
        return false;
      })
      .finally(() => {
        this.running = null;
      });
    this.running = task;
    return task;
  }

  /** Waits until the latest committed edit reaches Firestore, or a write fails. */
  async flush(): Promise<boolean> {
    this.clearTimer();
    while (!this.disposed && this.savedRevision < this.revision) {
      if (!(await this.saveOnce())) return false;
    }
    return !this.disposed;
  }

  dispose() {
    this.disposed = true;
    this.clearTimer();
  }
}
