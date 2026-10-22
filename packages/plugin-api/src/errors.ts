/**
 * Typed failures. Messages are fixed strings: they never echo plugin-supplied text
 * (which is untrusted and could be shown in a UI). `path` is a schema field path.
 */
export type PluginErrorCode =
  'MANIFEST' | 'REGISTRY' | 'PERMISSION' | 'CONFIG' | 'SELECTION' | 'REQUIRED_PLUGIN_FAILED' | 'LIMIT';

const MESSAGES: Readonly<Record<PluginErrorCode, string>> = {
  MANIFEST: 'invalid plugin manifest',
  REGISTRY: 'plugin registration rejected',
  PERMISSION: 'plugin permission denied',
  CONFIG: 'invalid host configuration',
  SELECTION: 'invalid privacy option selection',
  REQUIRED_PLUGIN_FAILED: 'a required plugin failed',
  LIMIT: 'size limit exceeded',
};

/** The only error class thrown by this package. */
export class PluginError extends Error {
  public readonly code: PluginErrorCode;
  public readonly path: string | undefined;

  public constructor(code: PluginErrorCode, path?: string) {
    super(path === undefined ? MESSAGES[code] : `${MESSAGES[code]} (${path})`);
    this.name = 'PluginError';
    this.code = code;
    this.path = path;
  }
}
