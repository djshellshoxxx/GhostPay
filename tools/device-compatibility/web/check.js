'use strict';
const $ = id => document.getElementById(id);
const routes = [['Home','home-h'],['Seller keys','keys-h'],['Create invoice','inv-h'],['Pay','pay-h'],
  ['Scan and receive','scan-h'],['Sweep','sw-h'],['Public registry','reg-h'],['Settings','set-h'],['About and privacy','about-h']];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label) {
  const end = Date.now() + 12000;
  do { const value = read(); if (value) return value; await wait(80); } while (Date.now() < end);
  throw new Error(label);
}
function positive(condition, label) { if (!condition) throw new Error(label); }
let downloadURL;
$('run').onclick = async function() {
  const btn = this; btn.disabled = true; $('save').hidden = true; $('result').textContent = '';
  const frame = $('app');
  const result = {suite:'ghostpay-compat-smoke/1', utc:new Date().toISOString(), environment:{},
    observedUA:navigator.userAgent, checks:[]};
  for (const field of ['target','model','os','browser','kind']) result.environment[field] = $(field).value;
  const identified = ['target','model','os','browser'].every(key => !!result.environment[key].trim()) &&
    result.environment.kind !== 'unspecified';
  result.identitySource = identified ? 'operator entered; verify against device About screen' : 'unspecified';
  async function check(name, fn) {
    $('status').textContent = name;
    try { const detail = await fn(); result.checks.push({name,status:'pass',detail}); return true; }
    catch (error) { result.checks.push({name,status:'fail',detail:String(error.message || error)}); return false; }
  }
  try {
    const boot = await check('Open GhostPay', async () => {
      const response = await fetch('build.json', {cache:'no-store'});
      positive(response.ok, 'Build identification unavailable'); result.build = await response.json();
      frame.src = '/?compat=' + Date.now();
      await until(() => frame.contentDocument.querySelector('main #home-h'), 'Home view did not load');
      result.frame = {width:frame.contentDocument.documentElement.clientWidth,height:frame.clientHeight};
      return 'Home heading visible in the application';
    });
    if (boot) {
      await check('Four browser self-checks', async () => {
        const nodes = await until(() => {
          const nodes = frame.contentDocument.querySelectorAll('.browser-checks-list strong[data-result]');
          return nodes.length === 4 ? Array.from(nodes) : null;
        }, 'Capability results unavailable');
        const values = nodes.map(el => el.parentNode.querySelector('span').textContent + ' = ' + el.dataset.result);
        positive(nodes.every(el => el.dataset.result === 'pass'), values.join(', ')); return values;
      });
      for (const [name,id] of routes) {
        await check(name + ' navigation and layout', async () => {
          const doc = frame.contentDocument;
          const control = Array.from(doc.querySelectorAll('nav button')).find(el => el.textContent.trim() === name || el.getAttribute('aria-label') === name);
          positive(control, 'Navigation button unavailable'); control.click();
          const heading = await until(() => doc.querySelector('main #' + id), 'Expected view did not appear');
          positive(heading.getBoundingClientRect().height > 0 && control.getAttribute('aria-current') === 'page','Selected route or heading incorrect');
          await new Promise(resolve => frame.contentWindow.requestAnimationFrame(() => frame.contentWindow.requestAnimationFrame(resolve)));
          const w = doc.documentElement.clientWidth;
          const out = Array.from(doc.querySelectorAll('nav button,main button,main input,main select,main textarea,main summary,main a[href]'))
              .filter(el => el.getClientRects().length && frame.contentWindow.getComputedStyle(el).visibility !== 'hidden')
              .filter(el => {const r=el.getBoundingClientRect();return r.width>0 && (r.left < -1 || r.right>w+1);});
          const scrollWidth = Math.max(doc.documentElement.scrollWidth,doc.body.scrollWidth);
          positive(scrollWidth<=w+1 && !out.length,'Viewport '+w+'px; content '+scrollWidth+'px; clipped controls '+out.length);
          return w + ' CSS px';
        });
      }
    }
  } catch(error) { result.checks.push({name:'Harness',status:'error',detail:String(error.message || error)}); }
  result.status = result.checks.length === routes.length+2 && result.checks.every(c => c.status==='pass') ? 'pass':'fail';
  $('result').textContent = JSON.stringify(result,null,2); $('status').textContent = 'Smoke result: '+result.status;
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  downloadURL = URL.createObjectURL(new Blob([$('result').textContent],{type:'application/json'}));
  $('save').href=downloadURL; $('save').hidden=false; btn.disabled=false;
};
