const SECRET_PATTERNS = [
  /0x[a-f\d]{40,}/gi,
  /\b[a-f\d]{64,}\b/gi,
  /\b[A-Za-z0-9_-]{64,}\b/g,
  /((?:password|passphrase|private[_ -]?key|secret|keystore)\s*[:=]\s*)[^\s,;]+/gi,
];

export function redactDiagnostics(value, limit = 1_000) {
  let text = String(value ?? '').replace(/[\r\n\t]+/g, ' ');
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (_match, prefix) => typeof prefix === 'string' ? `${prefix}[redacted]` : '[redacted]');
  }
  return text.slice(0, limit);
}
