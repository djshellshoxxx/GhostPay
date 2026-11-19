export async function request(signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted === true) throw new Error("ABORTED");
  try { await Promise.resolve(); }
  catch { if (signal?.aborted === true) throw new Error("ABORTED"); }
}
