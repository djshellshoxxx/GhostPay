// Runs only on the test server. File injection exercises the real File API and application handlers.
const fixture = await (await fetch('./qa-fixture.json')).json();
const steps = [];
const wait = async (get, label) => {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const value = get();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Timed out waiting for ' + label);
};
const find = (selector) => wait(() => document.querySelector(selector), selector);
const assert = (value, label) => { if (!value) throw Error(label); };
const upload = (input, file) => {
  const files = new DataTransfer();
  files.items.add(file);
  input.files = files.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

function imageFile(data, name) {
  const gif = Uint8Array.from(atob(data.split(',')[1]), ch => ch.charCodeAt(0));
  return new File([gif], name, { type: 'image/gif' });
}

async function run() {
  const restore = await find('button[aria-describedby="home-restore-help"]');
  const sample = await find('#home-sample');
  const calls = [];
  window.addEventListener('eip6963:requestProvider', () => calls.push('discovery'));
  Object.defineProperty(window, 'ethereum', { configurable: true, value: { request({ method }) { calls.push(method); throw Error('Unexpected wallet request'); } } });
  sample.querySelector('summary').click();
  assert(sample.open && sample.innerText.includes('0.0101 ETH') && sample.innerText.includes('your selected account'), 'Sample totals and wallet disclosure');
  assert(document.documentElement.scrollWidth <= document.documentElement.clientWidth, 'Horizontal overflow');
  sample.querySelector('summary').click();
  assert(!sample.open && calls.length === 0, 'Close sample without wallet access');
  steps.push('sample, fee, disclosure, width, wallet isolation');
  restore.click();
  const panel = await find('#keystore-import');
  await wait(() => panel.open && document.activeElement === panel.querySelector('summary'), 'focused open restore form');
  const form = panel.querySelector('form');
  const pass = form.querySelector('input[type=password]');
  const submit = async password => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(pass, password);
    pass.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    form.querySelector('[type=submit]').click();
  };
  upload(form.querySelector('input[type=file]'), new File([fixture.text], 'seller.json', { type: 'application/json' }));
  await submit('incorrect synthetic phrase');
  await wait(() => document.body.innerText.includes('Wrong passphrase, or the keystore was modified.'), 'wrong-passphrase rejection');
  assert(!document.body.innerText.includes(fixture.identity), 'Rejected restore installed keys');
  steps.push('keystore file and wrong passphrase');
  upload(panel.querySelector('input[accept*="image"]'), imageFile(fixture.qr, 'other-screen.gif'));
  await wait(() => document.body.innerText.includes('Encrypted keystore received.'), 'decoded backup QR image');
  await submit(fixture.pass);
  await wait(() => Array.from(document.querySelectorAll('code')).some(n => n.textContent === fixture.identity), 'matching restored public identity');
  document.querySelector('nav [data-view="home"]').click();
  await wait(() => document.body.innerText.includes('Seller keys are already loaded.'), 'loaded identity preserved');
  assert(!document.querySelector('button[aria-describedby="home-restore-help"]') && calls.length === 0, 'Loaded-session and wallet guards');
  steps.push('QR file, correct passphrase, identity match, loaded-session guard');
  document.querySelector('nav [data-view="pay"]').click();
  const importer = await wait(() => Array.from(document.querySelectorAll('details')).find(el => el.querySelector('summary')?.textContent === 'Scan an invoice QR or open a request file'), 'invoice importer');
  importer.querySelector('summary').click();
  upload(importer.querySelector('input[accept*="gpr.json"]'), new File([fixture.request], 'invoice.gpr.json', { type: 'application/json' }));
  await wait(() => document.body.innerText.includes('Review request file'), 'signed request file review');
  assert(!document.body.innerText.includes('Review payment'), 'File opened without confirmation');
  upload(importer.querySelector('input[accept*="image"]'), imageFile(fixture.invoiceQr, 'invoice.gif'));
  const open = await wait(() => Array.from(importer.querySelectorAll('button')).find(b => b.textContent === 'Open scanned invoice'), 'signed invoice QR review');
  assert(!document.body.innerText.includes('Review request file'), 'Old file preview survived QR replacement');
  assert(calls.length === 0, 'Import contacted wallet');
  open.click();
  await wait(() => document.body.innerText.includes('Native QA sample'), 'confirmed invoice memo');
  assert(!calls.some(method => method !== 'discovery'), 'Payment review requested wallet');
  steps.push('request-file review, QR replacement, explicit open, signed memo, zero wallet requests');
}
let error;
try { await run(); } catch (e) { error = String(e); }
await fetch(fixture.reportPath, { method: 'POST', body: JSON.stringify({
  ok: !error, error, steps, userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
}) });
