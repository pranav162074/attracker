import { describe, it, expect, vi } from 'vitest';
import { createWatch, isConnectionProblem } from '../src/db/watch.ts';

const coded = (message: string, code: string) => Object.assign(new Error(message), { code });

describe('watching the database connection', () => {
  it('knows a lost or hung connection from an ordinary query error', () => {
    expect(isConnectionProblem(new Error('Query read timeout'))).toBe(true);
    expect(isConnectionProblem(new Error('timeout exceeded when trying to connect'))).toBe(true);
    expect(isConnectionProblem(new Error('Connection terminated unexpectedly'))).toBe(true);
    expect(isConnectionProblem(coded('read ECONNRESET', 'ECONNRESET'))).toBe(true);
    expect(isConnectionProblem(coded('terminating connection due to administrator command', '57P01'))).toBe(true);
    expect(isConnectionProblem(coded('duplicate key value violates unique constraint', '23505'))).toBe(false);
    expect(isConnectionProblem(coded('canceling statement due to statement timeout', '57014'))).toBe(true);
    expect(isConnectionProblem('nope')).toBe(false);
  });

  it('gives up after several connection failures in a row', () => {
    const stuck = vi.fn();
    const watch = createWatch(3, stuck);
    watch.failed(new Error('Query read timeout'));
    watch.failed(new Error('Query read timeout'));
    expect(stuck).not.toHaveBeenCalled();
    watch.failed(new Error('Query read timeout'));
    expect(stuck).toHaveBeenCalledWith(3);
    watch.failed(new Error('Query read timeout'));
    expect(stuck).toHaveBeenCalledTimes(1);
  });

  it('starts counting again after a query works', () => {
    const stuck = vi.fn();
    const watch = createWatch(3, stuck);
    watch.failed(new Error('Query read timeout'));
    watch.failed(new Error('Query read timeout'));
    watch.ok();
    watch.failed(new Error('Query read timeout'));
    watch.failed(new Error('Query read timeout'));
    expect(stuck).not.toHaveBeenCalled();
  });

  it('ignores ordinary errors such as a duplicate name', () => {
    const stuck = vi.fn();
    const watch = createWatch(1, stuck);
    watch.failed(coded('duplicate key value violates unique constraint', '23505'));
    expect(stuck).not.toHaveBeenCalled();
  });
});
