// Minimal typings for the parts of jsdom 30 used by tests (no @types/jsdom is installed in the workspace).
declare module 'jsdom' {
  export class JSDOM {
    public constructor(html?: string, options?: Record<string, unknown>);
    public readonly window: Window & typeof globalThis;
  }
  export function requestInterceptor(
    fn: (request: Request, ctx: { element: unknown }) => Promise<Response | undefined> | Response | undefined,
  ): unknown;
}
