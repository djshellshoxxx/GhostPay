/** The base desktop configuration selects Chromium. Other engines must resolve their own browser. */
export function replayLaunchOptions(browserName, baseOptions, executablePath) {
  if (browserName !== 'chromium') return executablePath ? { executablePath } : {};
  if (!executablePath) return baseOptions ?? {};
  return {
    ...baseOptions,
    executablePath,
    args: [...new Set([...(baseOptions?.args ?? []), '--no-sandbox', '--disable-gpu'])],
  };
}
