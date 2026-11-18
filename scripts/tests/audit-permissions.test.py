"""Safe audit publication modes; inherit every original CLI regression unchanged."""
import json
from pathlib import Path
import runpy
import stat
import subprocess
import unittest

class AuditPublicationModes(runpy.run_path(str(Path(__file__).with_name('audit-cli.test.py')), run_name='audit_baseline')['AuditCli']):
    def invoke(self, script, *args, mask=0o022, fail=False):
        command = ['python3', str(self.scripts / script), *map(str, args)]
        if fail:
            code = "import os,runpy,sys; from unittest.mock import patch; sys.argv=sys.argv[1:]; " \
                "p=patch.object(os,'replace',side_effect=OSError('injected publication failure')); p.start(); runpy.run_path(sys.argv[0],run_name='__main__')"
            command = ['python3', '-c', code, *command[1:]]
        return subprocess.run(command, capture_output=True, text=True, umask=mask)

    def test_existing_output_modes_are_read_preserving_and_safe(self):
        report = self.root / 'docs/audits/report.md'
        golden = (Path(__file__).resolve().parents[2] / 'docs/audits/24-ai-assisted-security-audit-2026-10-28.md').read_bytes()
        original_status = self.status.read_bytes()
        for mode in (0o600, 0o640, 0o644, 0o666, 0o777, 0o6750, 0o440):
            for script, target, args in (
                ('record-cluster.py', self.status, [self.result, '--data', self.data]),
                ('gen-audit24-report.py', report, ['--data', self.data, report]),
            ):
                with self.subTest(script=script, mode=oct(mode)):
                    if target == self.status:
                        target.write_text('{}')
                    else:
                        self.status.chmod(0o600)
                        self.status.write_bytes(original_status)
                        target.write_text('old report')
                    target.chmod(mode)
                    p = self.invoke(script, *args)
                    self.assertEqual(p.returncode, 0, p.stderr)
                    self.assertEqual(stat.S_IMODE(target.stat().st_mode), mode & 0o644)
                    if target == self.status:
                        self.assertEqual(json.loads(target.read_text())['T']['outcome'], 'fixed')
                    else:
                        # The report content is independent of its permission policy; repeated output stays identical.
                        self.assertEqual(target.read_bytes(), golden)
                        first = target.read_bytes()
                        p = self.invoke(script, *args)
                        self.assertEqual(p.returncode, 0, p.stderr)
                        self.assertEqual(target.read_bytes(), first)

    def test_new_output_modes_honor_stricter_umasks_without_unsafe_bits(self):
        original_status = self.status.read_bytes()
        report = self.root / 'docs/audits/report.md'
        for mask in (0o000, 0o002, 0o022, 0o027, 0o077, 0o777):
            for script, target, args in (
                ('record-cluster.py', self.status, [self.result, '--data', self.data]),
                ('gen-audit24-report.py', report, ['--data', self.data, report]),
            ):
                with self.subTest(script=script, mask=oct(mask)):
                    if script == 'gen-audit24-report.py':
                        self.status.chmod(0o600)
                        self.status.write_bytes(original_status)
                    target.unlink(missing_ok=True)
                    p = self.invoke(script, *args, mask=mask)
                    self.assertEqual(p.returncode, 0, p.stderr)
                    self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o644 & ~mask)

    def test_failure_never_changes_existing_unsafe_bytes_or_permissions(self):
        report = self.root / 'docs/audits/report.md'
        report.write_text('sentinel')
        for script, target, args, stages in (
            ('record-cluster.py', self.status, [self.result, '--data', self.data], '.status-*'),
            ('gen-audit24-report.py', report, ['--data', self.data, report], '.audit-report-*'),
        ):
            target.chmod(0o777)
            before = target.read_bytes()
            p = self.invoke(script, *args, mask=0o000, fail=True)
            self.assertNotEqual(p.returncode, 0)
            self.assertIn('injected publication failure', p.stderr)
            self.assertEqual(target.read_bytes(), before)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o777)
            self.assertEqual(list(target.parent.glob(stages)), [])

if __name__ == '__main__':
    unittest.main(verbosity=2)
