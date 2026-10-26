from datetime import datetime,timezone
from pathlib import Path
import hashlib,json,os,subprocess,tempfile
repo=Path('/workspace/GhostPay-pr30-validation')
out=Path('/workspace/checkpoints/2026-10-26-ghostpay-root-exit')
status=out/'status.json';log=out/'npm-test.log'
now=lambda:datetime.now(timezone.utc).isoformat()
def write(data):
 with tempfile.NamedTemporaryFile('w',dir=out,delete=False) as f:
  json.dump(data,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno());tmp=f.name
 os.replace(tmp,status)
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=repo,text=True).strip()
if head!='88386d20e63bb33235f16f8383566f9c401a62e4' or subprocess.check_output(['git','status','--porcelain'],cwd=repo):raise RuntimeError('Source identity/cleanliness check failed')
compiler=Path('/workspace/ghostpay-tools/solc')
if hashlib.sha256(compiler.read_bytes()).hexdigest()!='9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25':raise RuntimeError('Compiler changed')
env=dict(os.environ,GHOSTPAY_SOLC_PATH=str(compiler),XDG_CONFIG_HOME='/workspace/.ghostpay-xdg/config',XDG_CACHE_HOME='/workspace/.ghostpay-xdg/cache',XDG_DATA_HOME='/workspace/.ghostpay-xdg/data',XDG_STATE_HOME='/workspace/.ghostpay-xdg/state')
data={'state':'starting','source':head,'tree':tree,'command':['npm','test'],'compilerSha256':hashlib.sha256(compiler.read_bytes()).hexdigest(),'processConfig':{k:env[k] for k in ['GHOSTPAY_SOLC_PATH','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_STATE_HOME']},'started':now(),'supervisorPid':os.getpid(),'log':str(log),'exitCode':None}
write(data)
try:
 with log.open('wb') as stream:
  proc=subprocess.Popen(['npm','test'],cwd=repo,env=env,stdout=stream,stderr=subprocess.STDOUT)
  data.update(state='running',childPid=proc.pid);write(data)
  rc=proc.wait();stream.flush();os.fsync(stream.fileno())
 data.update(state='finished',exitCode=rc,finished=now(),logSha256=hashlib.sha256(log.read_bytes()).hexdigest());write(data)
except BaseException as e:
 data.update(state='supervisor-error',finished=now(),errorType=type(e).__name__);write(data);raise
