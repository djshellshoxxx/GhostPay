const { createKeystoreApi } = await import('/home/user/wt/cand/packages/ux-vault/dist/portable.js');
const api = createKeystoreApi();
const samples = ['Correcthorse12', 'ilovemydog2026', 'Michael1985!!x', 'Liverpool2026!', 'Mustang#1969ab', 'Dragonfly2026x', 'Tr0ub4dor&3abc', 'Password123456', 'qwertyuiop1234', 'Summer2026!!ab', 'aaaaaaaaaaaaaa', 'Jennifer041990'];
for (const s of samples) { const st = api.passphraseStrength(s); const p = api.passphraseProblemMessage(s); console.log(JSON.stringify({ s, score: st.score, label: st.label, bits: st.bits, accepted: p === undefined })); }
