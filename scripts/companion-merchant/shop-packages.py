#!/usr/bin/env python3
"""Create deterministic local evaluation ZIPs from explicitly listed shop-module files."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[2]
MODULES = {
    'woocommerce': ('ghostpay-for-woocommerce', [
        'ghostpay-for-woocommerce.php', 'uninstall.php',
        'includes/class-ghostpay-gateway.php', 'includes/class-ghostpay-event.php',
        'includes/class-ghostpay-money.php', 'includes/class-ghostpay-secrets.php',
        'includes/class-ghostpay-signature.php',
    ]),
    'prestashop': ('ghostpay', [
        'ghostpay.php', 'index.php', 'controllers/index.php',
        'controllers/front/index.php', 'controllers/front/validation.php',
        'controllers/front/webhook.php', 'classes/index.php',
        'classes/class-ghostpay-event.php', 'classes/class-ghostpay-money.php',
        'classes/class-ghostpay-secrets.php', 'classes/class-ghostpay-signature.php',
        'views/index.php', 'views/templates/index.php', 'views/templates/hook/index.php',
    ]),
}


def package(shop: str, output: Path, root: Path = ROOT) -> dict:
    module, paths = MODULES[shop]
    base = root / 'integrations' / shop
    entries = [(f'{module}/{relative}', base / module / relative) for relative in paths]
    entries.append((f'{module}/README.md', base / 'README.md'))
    # Validate all inputs before creating the archive; never follow a symlink in any path component.
    for _, path in entries:
        if any(part.is_symlink() for part in [path, *path.parents]) or not path.is_file():
            raise ValueError(f'Unsafe or missing package input: {path.relative_to(root)}')
    output.mkdir(parents=True, exist_ok=True)
    target = output / f'{module}.zip'
    # Refuse accidental overwrite, including symbolic links. ZIP_STORED avoids compressor-version drift.
    with target.open('xb') as destination:
        with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_STORED) as archive:
            for name, path in sorted(entries):
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.external_attr = 0o100644 << 16
                info.create_system = 3
                archive.writestr(info, path.read_bytes())
    return {'file': target.name, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'files': len(entries)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='Fresh local artifact directory')
    args = parser.parse_args()
    # These archives are evaluation artifacts, not platform certification or a public release.
    print(json.dumps({'qualification': 'local-evaluation-only', 'archives': [package(shop, args.output) for shop in MODULES]}, indent=2))


if __name__ == '__main__':
    main()
