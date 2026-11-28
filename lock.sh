#!/usr/bin/env bash
# SECONDARY helper for the shared integration lock (automation/ghostpay-integration-lock, non-force CAS push).
# Usage: lock.sh status
#        lock.sh acquire <purpose>          -> prints token; fails if held and unexpired by someone else
#        lock.sh release <token> <note>     -> releases only if we hold it with that token
set -euo pipefail
REF=automation/ghostpay-integration-lock
WT=/workspace/secondary/lockwt
OWNER=secondary-coordinator-20261128
cd /workspace/GhostPay
git fetch -q origin "$REF" main
if [ ! -d "$WT" ]; then git worktree add -q --detach "$WT" "origin/$REF"; fi
cd "$WT"
git checkout -q --detach "origin/$REF"
cmd="${1:-status}"
case "$cmd" in
  status) cat integration-lock.json; echo; git log -1 --oneline ;;
  acquire)
    purpose="$2"
    python3 - "$purpose" <<'EOF'
import json, sys, datetime, secrets, subprocess
p='integration-lock.json'; d=json.load(open(p))
now=datetime.datetime.now(datetime.timezone.utc)
exp=d.get('expires_at')
if d.get('status')=='held':
    e=datetime.datetime.fromisoformat(exp.replace('Z','+00:00')) if exp else None
    print('LOCK HELD by', d.get('owner'), 'expires', exp, file=sys.stderr)
    # Never take over a held lock, even if expired: report and stop.
    sys.exit(3)
main=subprocess.check_output(['git','-C','/workspace/GhostPay','rev-parse','origin/main'],text=True).strip()
tok=secrets.token_hex(16)
f=lambda t:t.strftime('%Y-%m-%dT%H:%M:%S.000Z')
d.update({"format":"ghostpay-integration-lock/1","status":"held","owner":"secondary-coordinator-20261128","token":tok,
          "generation":int(d.get('generation',0))+1,"base_sha":main,"acquired_at":f(now),"heartbeat_at":f(now),
          "expires_at":f(now+datetime.timedelta(minutes=45)),"transport":"git-ref-nonforce-cas","purpose":sys.argv[1]})
d.pop('released_at',None)
json.dump(d,open(p,'w'),indent=2); open(p,'a').write('\n')
open('/workspace/secondary/.lock-token','w').write(tok)
print(tok)
EOF
    gen=$(python3 -c "import json;print(json.load(open('integration-lock.json'))['generation'])")
    git add integration-lock.json
    git commit -q -m "coordination: acquire generation-$gen integration lock for SECONDARY ($2)"
    git push -q origin "HEAD:refs/heads/$REF"
    echo "acquired generation $gen"
    ;;
  release)
    tok="$2"; note="$3"
    python3 - "$tok" <<'EOF'
import json, sys, datetime
p='integration-lock.json'; d=json.load(open(p))
if d.get('status')!='held' or d.get('token')!=sys.argv[1] or d.get('owner')!='secondary-coordinator-20261128':
    print('not our lock:', d.get('owner'), d.get('status'), file=sys.stderr); sys.exit(4)
now=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
d.update({"status":"released","heartbeat_at":now,"expires_at":now,"released_at":now})
json.dump(d,open(p,'w'),indent=2); open(p,'a').write('\n')
EOF
    gen=$(python3 -c "import json;print(json.load(open('integration-lock.json'))['generation'])")
    git add integration-lock.json
    git commit -q -m "coordination: release generation-$gen lock for SECONDARY; $note"
    git push -q origin "HEAD:refs/heads/$REF"
    echo "released generation $gen"
    ;;
esac
