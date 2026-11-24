#!/usr/bin/env python3
"""Keep pinned Mythril's CLI intact while using Solidity's official compiler host."""


def main():
    # py-solc-x1.1.1 uses a legacy host which returned503 during native qualification.
    # Set its transport constant before importing Mythril (which enumerates compiler versions).
    import solcx.install
    solcx.install.BINARY_DOWNLOAD_BASE = "https://binaries.soliditylang.org/{}-amd64/{}"
    from mythril.interfaces.cli import main as mythril_main
    return mythril_main()


if __name__ == "__main__":
    raise SystemExit(main())
