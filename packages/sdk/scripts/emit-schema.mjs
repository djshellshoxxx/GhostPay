// Usage: npm run build -w @ghostpay/sdk && node packages/sdk/scripts/emit-schema.mjs
import { writeFileSync } from 'node:fs';
import { schemaFiles } from '../dist/index.js';

for (const [name, schema] of Object.entries(schemaFiles)) {
  writeFileSync(new URL(`../schema/${name}`, import.meta.url), JSON.stringify(schema, null, 2) + '\n');
}
