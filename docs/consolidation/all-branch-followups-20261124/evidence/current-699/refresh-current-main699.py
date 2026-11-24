import concurrent.futures as cf
import collections, datetime, hashlib, json, pathlib, subprocess, gzip
ROOT=pathlib.Path('/workspace/scratch/f80482f352bc')
OUT=ROOT/'branch-index-current-main-20261124'
OBJ=ROOT/'branch-index-refresh-objects.git'
def git(*args):
 return subprocess.check_output(['git','--git-dir='+str(OBJ),*args],text=True).strip()
base='cc090bf80bbf35c1db81ecbe6acae694a518bed0'
ancestors=set(git('rev-list',base).splitlines())
snapshot=json.loads((OUT/'REMOTE_SNAPSHOT.json').read_text())
refs=[(r['branch'],r['head'],'') for r in snapshot['refs']]
pr_by_ref=collections.defaultdict(list)
def is_evidence(path):
    return path.startswith(('docs/', '.claude/', '.codex/')) or path.endswith(('.md', '.rst', '.txt', '.log')) or path in ('LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE')

def inspect(entry):
    name, sha, date = entry
    row = {'branch':name, 'head':sha, 'date':date, 'prs':pr_by_ref[name]}
    if sha in ancestors:
        row.update(status='main' if name == 'main' else 'ancestor', ahead=0, remaining_paths=[], code_paths=[])
        return row
    try:
        bases = git('merge-base', '--all', base, sha).splitlines()
        mb = bases[0]
    except subprocess.CalledProcessError as error:
        if error.returncode != 1:
            raise
        paths = git('ls-tree', '-r', '--name-only', sha).splitlines()
        row.update(status='unrelated-history', ahead=None, remaining_paths=paths, code_paths=[p for p in paths if not is_evidence(p)])
        return row
    behind, ahead = map(int, git('rev-list', '--left-right', '--count', base+'...'+sha).split())
    delta = sorted({path for common in bases for path in git('diff', '--name-only', '--no-renames', common, sha).splitlines()})
    different = set(git('diff', '--name-only', '--no-renames', base, sha).splitlines())
    remain = [p for p in delta if p in different]
    code = [p for p in remain if not is_evidence(p)]
    all_code = [p for p in delta if not is_evidence(p)]
    status = 'no-net-delta' if not delta else 'evidence-only' if not all_code else 'code-tree-equivalent' if not code else 'needs-semantic-review'
    row.update(status=status, merge_base=mb, all_best_merge_bases=bases, ahead=ahead, behind=behind, changed_paths=delta, remaining_paths=remain, code_paths=code, equal_code_paths=[p for p in all_code if p not in different])
    return row


with cf.ThreadPoolExecutor(max_workers=8) as pool:
 rows=list(pool.map(inspect,refs))
rows.sort(key=lambda r:r['branch'])
result={'format':'ghostpay-current-main-census/1','observed_at':snapshot['observed_at'],'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'main':base,'uncapped':True,'all_best_merge_bases':True,'rename_detection':False,'branches':rows,'counts':dict(collections.Counter(r['status'] for r in rows))}
data=(json.dumps(result,separators=(',',':'))+'\n').encode()
(OUT/'STRUCTURAL_MAIN.json.gz').write_bytes(gzip.compress(data,mtime=0))
(OUT/'STRUCTURAL_MAIN_RECEIPT.json').write_text(json.dumps({'rows':len(rows),'main':base,'counts':result['counts'],'uncapped':True,'uncompressed_bytes':len(data),'uncompressed_sha256':hashlib.sha256(data).hexdigest(),'compressed_bytes':(OUT/'STRUCTURAL_MAIN.json.gz').stat().st_size},indent=2)+'\n')
print(json.dumps({'rows':len(rows),'counts':result['counts'],'uncompressed_bytes':len(data),'compressed_bytes':(OUT/'STRUCTURAL_MAIN.json.gz').stat().st_size}))
