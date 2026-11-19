from pathlib import Path
import subprocess,sys,json,time,datetime
name, root_text, cwd_text, *command = sys.argv[1:]
root=Path(root_text)
evidence=Path(__file__).parent
source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
start=time.monotonic()
with (evidence/f'{name}.log').open('w') as log:
 result=subprocess.run(command,cwd=root/cwd_text,stdout=log,stderr=subprocess.STDOUT)
record={'name':name,'source_revision':source,'command':command,'cwd':cwd_text,'exit_code':result.returncode,'seconds':round(time.monotonic()-start,3),'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'log':f'{name}.log'}
(evidence/f'{name}.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record),flush=True)
raise SystemExit(result.returncode)
