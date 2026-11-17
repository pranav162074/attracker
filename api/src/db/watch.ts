const CONNECTION_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', '57P01', '57P03', '08000', '08003', '08006']);

export const isConnectionProblem = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && CONNECTION_CODES.has(code)) return true;
  return /timeout|Connection terminated|Client has encountered a connection error/i.test(error.message);
};

export const createWatch = (limit: number, onStuck: (failures: number) => void) => {
  let failures = 0;
  let stuck = false;
  return {
    ok: () => {
      failures = 0;
    },
    failed: (error: unknown) => {
      if (!isConnectionProblem(error) || stuck) return;
      failures += 1;
      if (failures >= limit) {
        stuck = true;
        onStuck(failures);
      }
    },
  };
};
