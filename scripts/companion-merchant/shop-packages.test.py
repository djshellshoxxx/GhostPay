import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('shop_packages', Path(__file__).with_name('shop-packages.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PackagingTests(unittest.TestCase):
    def test_archives_are_deterministic_and_contain_only_listed_module_inputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for shop in builder.MODULES:
                first = builder.package(shop, root / 'one')
                second = builder.package(shop, root / 'two')
                self.assertEqual(first['sha256'], second['sha256'])
                module, files = builder.MODULES[shop]
                with zipfile.ZipFile(root / 'one' / first['file']) as archive:
                    self.assertEqual(set(archive.namelist()), {f'{module}/{name}' for name in files} | {f'{module}/README.md'})
                    self.assertTrue(all(info.external_attr >> 16 == 0o100644 for info in archive.infolist()))
                with self.assertRaises(FileExistsError):
                    builder.package(shop, root / 'one')

    def test_missing_inputs_are_refused_before_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(ValueError):
                builder.package('prestashop', root / 'out', root)
            self.assertFalse((root / 'out').exists())

    def test_symlinked_input_is_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module, files = builder.MODULES['prestashop']
            source = root / 'integrations/prestashop' / module
            source.mkdir(parents=True)
            (source / files[0]).symlink_to(builder.ROOT / 'integrations/prestashop' / module / files[0])
            with self.assertRaises(ValueError):
                builder.package('prestashop', root / 'out', root)
            self.assertFalse((root / 'out').exists())


if __name__ == '__main__':
    unittest.main()
