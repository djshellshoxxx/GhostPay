export const REDIRECT_HEADER: string;
export interface HttpRedirectFixture {
  readonly origin: string;
  readonly responses: { readonly status: number; readonly location: string; readonly path: string | undefined }[];
  setRedirect(status: 302 | 307, location: string): void;
  close(): Promise<void>;
}
export function startHttpRedirectFixture(upstreamOrigin: string): Promise<HttpRedirectFixture>;
