// The script-free notice and the language picker share the same source wording.
import catalog from '../../apps/web/locales/en.json' with { type: 'json' };

const networks = { 11155111: 'Ethereum Sepolia', 84532: 'Base Sepolia', 11155420: 'OP Sepolia', 421614: 'Arbitrum Sepolia', 80002: 'Polygon Amoy', 97: 'BNB Smart Chain Testnet', 43113: 'Avalanche Fuji' };
const escapeText = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function renderMirrorNotice(chainIds, shared, development) {
  const chains = chainIds.map((id) => {
    if (!Object.hasOwn(networks, id)) throw new Error('Unrecognized Pages network');
    return `${networks[id]} (${id})`;
  }).join(', ');
  function copy(key, tag = 'span') {
    const template = catalog.messages[`pagesMirror.${key}`];
    const list = key === 'beta' ? ` data-chains="${escapeText(chains)}"` : '';
    return `<${tag} data-mirror="${key}"${list}>${escapeText(template.replace('{chains}', chains))}</${tag}>`;
  }
  return `<div class="gp-pages-mirror" role="note" id="gp-pages-mirror" lang="en" dir="ltr">
    ${copy('title', 'strong')} ${development ? copy('development') : ''} ${copy(chains ? 'beta' : 'demo', 'strong')} ${shared ? copy('testKeys') : ''}
    <details><summary>${copy('details')} <span data-mirror-language hidden></span></summary>
    ${chains ? '' : copy('manifest')} ${shared ? copy('shared') : ''} ${copy('integrity')}
    <a href="https://github.com/djshellshoxxx/GhostPay/blob/main/docs/pages/README.md" hreflang="en" rel="noopener noreferrer">${copy('verify')}</a></details>
  </div>`;
}
