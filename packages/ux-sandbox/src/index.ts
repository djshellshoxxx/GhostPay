// Deprecated: thin re-export of @ghostpay/sandbox kept for compatibility.
// Explicit exports below shadow same-named simulator exports so old ux-sandbox names keep their old meaning.
export * from '@ghostpay/sandbox';
export {
  UxMockChain as MockChain,
  UxSandboxError as SandboxError,
  type UxClock as Clock,
  type UxSandboxErrorCode as SandboxErrorCode,
} from '@ghostpay/sandbox';
