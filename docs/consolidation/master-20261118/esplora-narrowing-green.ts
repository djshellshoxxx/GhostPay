export async function request(signal: AbortSignal | undefined): Promise<void> {
  const assertNotAborted = (): void => { if (signal?.aborted === true) throw new Error("ABORTED"); };
  assertNotAborted();
  try { await Promise.resolve(); }
  catch { assertNotAborted(); }
}
