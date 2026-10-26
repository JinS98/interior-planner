import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutoSave, type SaveStatus } from './autoSave';

afterEach(() => vi.useRealTimers());

describe('AutoSave', () => {
  it('debounces several edits into one write', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const statuses: SaveStatus[] = [];
    const autoSave = new AutoSave(save, (status) => statuses.push(status), String);
    autoSave.changed();
    await vi.advanceTimersByTimeAsync(500);
    autoSave.changed();
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toEqual({ phase: 'saved', dirty: false, error: null });
    autoSave.dispose();
  });

  it('saves edits made during an in-flight write before flush completes', async () => {
    let finishFirst!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const statuses: SaveStatus[] = [];
    const autoSave = new AutoSave(save, (status) => statuses.push(status), String);
    autoSave.changed();
    const flushing = autoSave.flush();
    await Promise.resolve();
    autoSave.changed();
    finishFirst();
    expect(await flushing).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)?.phase).toBe('saved');
    autoSave.dispose();
  });

  it('keeps the edit dirty after a failure and retries it', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const statuses: SaveStatus[] = [];
    const autoSave = new AutoSave(
      save,
      (status) => statuses.push(status),
      (error) => String(error),
    );
    autoSave.changed();
    expect(await autoSave.flush()).toBe(false);
    expect(statuses.at(-1)).toMatchObject({ phase: 'error', dirty: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toEqual({ phase: 'saved', dirty: false, error: null });
    autoSave.dispose();
  });
});
