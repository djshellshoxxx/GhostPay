"""Approved metadata-only repack of the exact locked official Viem archive."""
from pathlib import Path, PurePosixPath
import base64, gzip, hashlib, io, json, os, tarfile, copy, sys
assert len(sys.argv)==3, 'Usage: python3 vendor/repack-viem.py UPSTREAM_TGZ OUTPUT_DIRECTORY'
up=Path(sys.argv[1])
output_directory=Path(sys.argv[2])
raw=up.read_bytes()
sri=lambda value:'sha512-'+base64.b64encode(hashlib.sha512(value).digest()).decode()
sha=lambda value:hashlib.sha256(value).hexdigest()
expected='sha512-HfWnMmSPHNY+F3+I01ZKvIbwdn8qZUEhV/rzBi094F6gmqHA1KBXdF7P9po5/OYkvBjzxduUlLBgownyZkV+uA=='
assert sri(raw)==expected
with tarfile.open(up,'r:gz') as source:
 members=source.getmembers();names=[m.name for m in members]
 assert len(names)==len(set(names))
 payload={}
 for m in members:
  p=PurePosixPath(m.name)
  assert m.isfile() and not p.is_absolute() and '..' not in p.parts and p.parts[0]=='package'
  assert 0<=m.size<=20_000_000
  handle=source.extractfile(m);assert handle is not None
  payload[m.name]=handle.read()
 old_manifest=json.loads(payload['package/package.json'])
 assert old_manifest['name']=='viem' and old_manifest['version']=='2.22.14'
 assert old_manifest['dependencies']['ws']=='8.18.0' and old_manifest['dependencies']['abitype']=='1.0.8'
 assert 'zod' not in old_manifest['dependencies']
 new_manifest=copy.deepcopy(old_manifest)
 new_manifest['version']='2.22.14+ghostpay.deps2'
 new_manifest['dependencies']['ws']='8.21.0'
 new_manifest['dependencies']['abitype']='1.2.3'
 manifest_raw=(json.dumps(new_manifest,ensure_ascii=False,indent=2)+'\n').encode()
 assert set(new_manifest)==set(old_manifest)
 assert {k for k in old_manifest if old_manifest[k]!=new_manifest[k]}=={'version','dependencies'}
 newdep=dict(new_manifest['dependencies']);newdep['abitype']='1.0.8';newdep['ws']='8.18.0';assert newdep==old_manifest['dependencies']
 output=io.BytesIO()
 with gzip.GzipFile(fileobj=output,mode='wb',mtime=0,filename='',compresslevel=9) as compressed:
  with tarfile.open(fileobj=compressed,mode='w',format=tarfile.USTAR_FORMAT) as target:
   for m in sorted(members,key=lambda m:m.name):
    data=manifest_raw if m.name=='package/package.json' else payload[m.name]
    t=tarfile.TarInfo(m.name);t.size=len(data);t.mode=m.mode;t.type=m.type
    t.uid=t.gid=0;t.uname=t.gname='';t.mtime=0
    target.addfile(t,io.BytesIO(data))
 packed=output.getvalue()
 with tarfile.open(fileobj=io.BytesIO(packed),mode='r:gz') as target:
  after={m.name:(m,target.extractfile(m).read()) for m in target.getmembers()}
  assert set(after)==set(names)
  unchanged=[]
  for m in members:
   n,data=after[m.name];assert n.mode==m.mode and n.type==m.type
   if m.name!='package/package.json':assert data==payload[m.name];unchanged.append({'path':m.name,'bytes':len(data),'sha256':sha(data),'mode':m.mode})
  assert json.loads(after['package/package.json'][1])==new_manifest
 vendor=output_directory;vendor.mkdir(parents=True,exist_ok=True)
 archive=vendor/'viem-2.22.14-ghostpay-deps2.tgz';assert not archive.exists();archive.write_bytes(packed)
 notice=vendor/'viem-2.22.14-ghostpay-deps2.LICENSE.txt';notice.write_bytes(payload['package/LICENSE'])
 provenance={'kind':'LOCAL metadata-only compatibility artifact; NOT an upstream release','upstream':{'name':'viem','version':'2.22.14','registry_url':'https://registry.npmjs.org/viem/-/viem-2.22.14.tgz','locked_integrity':expected,'bytes':len(raw),'sha256':sha(raw)},'local':{'name':'viem','version':new_manifest['version'],'path':'vendor/'+archive.name,'bytes':len(packed),'sha256':sha(packed),'integrity':sri(packed)},'manifest_changes':{'version':{'before':'2.22.14','after':new_manifest['version']},'dependencies.ws':{'before':'8.18.0','after':'8.21.0'},'dependencies.abitype':{'before':'1.0.8','after':'1.2.3'}},'manifest_before_sha256':sha(payload['package/package.json']),'manifest_after_sha256':sha(manifest_raw),'runtime_type_license_files_unchanged':True,'unchanged_member_count':len(unchanged),'unchanged_member_manifest':unchanged,'archive_member_names_types_modes_preserved':True,'tar_normalization':{'order':'lexicographic','uid':0,'gid':0,'uname':'','gname':'','mtime':0,'format':'USTAR','gzip_mtime':0,'gzip_filename':'','gzip_level':9},'build_script_path':'vendor/repack-viem.py','build_script_sha256':sha(Path(__file__).read_bytes()),'dependency_resolution_and_tests':'PENDING, not claimed by packaging verification'}
 (vendor/'viem-2.22.14-ghostpay-deps2.provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
 print(json.dumps({k:v for k,v in provenance.items() if k!='unchanged_member_manifest'},indent=2))
