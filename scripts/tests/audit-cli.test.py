import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[2]
class AuditCli(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ghostpay-audit-cli-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'repo'
        self.scripts = self.root / 'scripts/audit'
        self.scripts.mkdir(parents=True)
        for name in ('record-cluster.py', 'gen-audit24-report.py'):
            shutil.copyfile(SOURCE / 'scripts/audit' / name, self.scripts / name)
        self.data = self.root / 'docs/audits/data/24'
        shutil.copytree(SOURCE / 'docs/audits/data/24', self.data)
        self.status = self.data / 'status.json'
        self.result = self.data / 'result.json'
        self.obj = dict(cluster='test', branch='test', approved=True, rounds=1,
            impl=dict(commits=['abcdef1'], items=[dict(id='T',outcome='fixed',change='test')]))
        self.result.write_text(json.dumps(self.obj))
    def record(self, result=None, data=None):
        return subprocess.run(['python3',str(self.scripts/'record-cluster.py'),str(result or self.result),'--data',str(data or self.data)],capture_output=True,text=True)
    def test_valid_and_mode(self):
        self.status.chmod(0o640)
        before=json.loads(self.status.read_text())
        p=self.record(); self.assertEqual(p.returncode,0,p.stderr)
        after=json.loads(self.status.read_text()); self.assertEqual(after['T']['outcome'],'fixed')
        for key in before:
            if key != '_clusters': self.assertEqual(after[key],before[key])
        self.assertEqual(stat.S_IMODE(self.status.stat().st_mode),0o640)
    def test_outside_result_refused(self):
        outside=Path(self.tmp.name)/'outside.json'; outside.write_text(self.result.read_text())
        before=self.status.read_bytes(); self.assertNotEqual(self.record(result=outside).returncode,0)
        self.assertEqual(self.status.read_bytes(),before)
    def test_outside_data_refused(self):
        outside=Path(self.tmp.name)/'outside'; outside.mkdir(); sentinel=outside/'status.json';sentinel.write_text('{}')
        self.assertNotEqual(self.record(data=outside).returncode,0);self.assertEqual(sentinel.read_bytes(),b'{}')
    def test_symlink_status_refused(self):
        outside=Path(self.tmp.name)/'outside.json';outside.write_text('{}');outside.chmod(0o640)
        self.status.unlink();self.status.symlink_to(outside)
        self.assertNotEqual(self.record().returncode,0);self.assertEqual(outside.read_bytes(),b'{}');self.assertEqual(stat.S_IMODE(outside.stat().st_mode),0o640)
    def test_symlink_result_and_directory_refused(self):
        target=self.data/'actual.json';self.result.rename(target);self.result.symlink_to(target)
        self.assertNotEqual(self.record().returncode,0)
        self.result.unlink();self.result.write_text(target.read_text())
        alias=self.data.parent/'alias';alias.symlink_to(self.data,target_is_directory=True)
        self.assertNotEqual(self.record(data=alias).returncode,0)
    def test_invalid_preserves_bytes_and_mode(self):
        self.status.chmod(0o640);before=self.status.read_bytes()
        for obj in ({'impl':{}},dict(self.obj,impl=dict(commits=['bad SHA'],items=[])),dict(self.obj,review={'issues':[{}]})):
            self.result.write_text(json.dumps(obj));self.assertNotEqual(self.record().returncode,0)
            self.assertEqual(self.status.read_bytes(),before);self.assertEqual(stat.S_IMODE(self.status.stat().st_mode),0o640)
    def test_write_failure_preserves_status_and_removes_stage(self):
        before=self.status.read_bytes();self.status.chmod(0o640)
        code = "import os,runpy,sys; from unittest.mock import patch; sys.argv=sys.argv[1:]; " \
            "p=patch.object(os,'replace',side_effect=OSError('injected publication failure')); p.start(); runpy.run_path(sys.argv[0],run_name='__main__')"
        p=subprocess.run(['python3','-c',code,str(self.scripts/'record-cluster.py'),str(self.result),'--data',str(self.data)],capture_output=True,text=True)
        self.assertNotEqual(p.returncode,0);self.assertIn('injected publication failure',p.stderr)
        self.assertEqual(self.status.read_bytes(),before);self.assertEqual(stat.S_IMODE(self.status.stat().st_mode),0o640)
        self.assertEqual(list(self.data.glob('.status-*')),[])
    def test_malformed_json_preserves_status(self):
        before=self.status.read_bytes();self.result.write_text('{')
        self.assertNotEqual(self.record().returncode,0);self.assertEqual(self.status.read_bytes(),before)
    def test_new_status_mode(self):
        self.status.unlink();mask=os.umask(0);os.umask(mask)
        p=self.record();self.assertEqual(p.returncode,0,p.stderr)
        self.assertEqual(stat.S_IMODE(self.status.stat().st_mode),0o666 & ~mask)
    def test_untrusted_directory_refused(self):
        before=self.status.read_bytes();self.data.chmod(0o777)
        self.assertNotEqual(self.record().returncode,0);self.assertEqual(self.status.read_bytes(),before)
    def test_report_outside_and_symlink_refusal(self):
        out=Path(self.tmp.name)/'outside.md';out.write_text('sentinel')
        link=self.root/'docs/audits/link.md';link.symlink_to(out)
        for path in (out,link):
            p=subprocess.run(['python3',str(self.scripts/'gen-audit24-report.py'),str(path)],capture_output=True,text=True)
            self.assertEqual(p.returncode,2,p.stderr);self.assertEqual(out.read_text(),'sentinel')
    def test_report_failure_preserves_bytes_and_mode(self):
        out=self.root/'docs/audits/report.md';out.write_text('sentinel');out.chmod(0o640)
        code = "import os,runpy,sys; from unittest.mock import patch; sys.argv=sys.argv[1:]; " \
            "p=patch.object(os,'replace',side_effect=OSError('injected publication failure')); p.start(); runpy.run_path(sys.argv[0],run_name='__main__')"
        p=subprocess.run(['python3','-c',code,str(self.scripts/'gen-audit24-report.py'),'--data',str(self.data),str(out)],capture_output=True,text=True)
        self.assertNotEqual(p.returncode,0);self.assertIn('injected publication failure',p.stderr)
        self.assertEqual(out.read_text(),'sentinel');self.assertEqual(stat.S_IMODE(out.stat().st_mode),0o640)
        self.assertEqual(list(out.parent.glob('.audit-report-*')),[])
    def test_report_modes_and_bytes(self):
        out=self.root/'docs/audits/report.md';out.write_text('old');out.chmod(0o640)
        cmd=['python3',str(self.scripts/'gen-audit24-report.py'),'--data',str(self.data),str(out)]
        p=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(p.returncode,0,p.stderr)
        self.assertEqual(stat.S_IMODE(out.stat().st_mode),0o640)
        first=out.read_bytes()
        self.assertEqual(first, (SOURCE/'docs/audits/24-ai-assisted-security-audit-2026-10-28.md').read_bytes())
        out.unlink()
        mask=os.umask(0);os.umask(mask)
        p=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(p.returncode,0,p.stderr)
        self.assertEqual(out.read_bytes(),first);self.assertEqual(stat.S_IMODE(out.stat().st_mode),0o666 & ~mask)
if __name__=='__main__':unittest.main(verbosity=2)
