# Devnet end-to-end log

Run: 2026-10-21T22:45:10.606Z  
Commit: 698404ca488c87347858105bda66be21bf428303 (working tree may contain uncommitted changes)  
Node: v22.22.0  
Anvil: anvil Version: 1.8.5  
Chain: local anvil, chain id 31337 (no public network; public anvil dev accounts only; no real funds)

## Contracts

- Announcer (reference ERC-5564): `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- GhostPayRouter: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` (deploy tx `0xbe298e6737f17ee15a31f052ec0d716c00caf4cf62089f2c946cb12404525fa5`)
- GhostPaySweepRelayer: `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` (deploy tx `0xfec2332784150c26cade27111f23fd26373722aa68b70a2a932a879bd0b2836f`)
- Fee recipient (anvil account 1): `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- Devnet tokens: USDC `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9`, DAI `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707`, USDT `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9`

## Steps

1. PASS preflight - router=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 relayer=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 announcer=0x5FbDB2315678afecb367f032d93F642f64180aa3
2. PASS seller keygen + invoices - meta=st:eth:0x03d16b7dbef... invoices=4 (signed, signature verified)
3. PASS pay - ETH:gross=1000000000000000000 fee=2500000000000000 net=997500000000000000; USDC:gross=1000000000 fee=2500000 net=997500000; USDT:gross=500000000 fee=1250000 net=498750000; DAI:gross=200000000000000000000 fee=500000000000000000 net=199500000000000000000
4. PASS router fee parity - on-chain deltas equal chain-adapters routerSplit() for all 4 payments
5. PASS scan - announcements=4 matched=4 skipped=0
6. PASS direct sweep ETH - swept 0.997476011798196 ETH to 0x976EA74026E726554dB657fA54763abd0C3a0aa9
7. PASS direct sweep USDT (gas topped up) - swept 498750000 base units
8. PASS relayer started - port=18787 sweepRelayer=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
9. PASS relayer sweep USDC - amount=997500000 fee=4987500 dest=0x976EA74026E726554dB657fA54763abd0C3a0aa9; stealth never held ETH
10. PASS relayer replay USDC refused - 409 nonce_used
11. PASS relayer sweep DAI - amount=199500000000000000000 fee=997500000000000000 dest=0x14dC79964da2C08b23698B3D3cc7Ca32193d9955; stealth never held ETH
12. PASS relayer replay DAI refused - 409 nonce_used

## Transactions (this run)

| Label | Tx hash | Block | Gas used |
|---|---|---|---|
| mint USDC to payer | `0xd1227279588f46b290397acc25b8994d4de7ca353fc6ec9ca96965f01c5176c7` | 7 | 68456 |
| mint USDT to payer | `0x2244eac5ceeb60be156a0eeca16bc6c61eaaf5d756b76e6bef8507510ad65782` | 8 | 68367 |
| mint DAI to payer | `0x4360ae2e5ff431267dd63b2926692a18f38b9ee86f87588fc4f4c1ab5155e29d` | 9 | 68504 |
| pay ETH (payNative) | `0x983d4350da51de40ff60f730f893d7724e08731b81825da6c9bdbf46de438b1b` | 10 | 82598 |
| pay USDC (payERC20WithPermit) | `0x996f56cf5b1724d738d778ef4036a1c6dd69751a1ea83ebbc790cbf033e0010e` | 11 | 137203 |
| approve USDT | `0x0e31f6d5cb6b125f4c4d488ea4dbd8a5f8130fe7d2550bcfefbeb3f290752518` | 12 | 46330 |
| pay USDT (payERC20) | `0x297205af215a783b9ad2ad7eded00c8205710b55f47ec4b09c9ce6aba2590940` | 13 | 103662 |
| approve DAI | `0x36c88b756fce6b238dd4d3ccbb5c10905257d65e5ca08b63cf65b46229fed6aa` | 14 | 46401 |
| pay DAI (payERC20) | `0x47f4e47c5f708c985c8c2095cd4f786024154cf86f1d7b8d1afac0bfa35f487a` | 15 | 103698 |
| direct sweep ETH | `0x37994016e72f3d8b489b3d7f2896b16ab8aa533b444f6aa66a6ddde8058a5edd` | 16 | 21000 |
| fund USDT stealth gas | `0x9dde8e853268a3296d9425d5afdbde33289614c5d19dc6d1a0ba8e54f7be25eb` | 17 | 21000 |
| direct sweep USDT | `0x7b109ed71718f2791b5d562a17f71af1a50217fcc7b09b14a34ecf44c274550a` | 18 | 46789 |
| relayer sweep USDC (permit) | `0x424e7d5d4f8a711b553481ac3637847a28369b3bbafd988accadf888ddb63de1` | 19 | 158609 |
| relayer sweep DAI (permit) | `0x8b1e92690d1be893b3400237fe6cdb26623995eac371c84bd64f06295fd2982c` | 20 | 158693 |

Caveats: payments are built under the 84532 chain-adapters alias (the adapter chain table has no 31337 entry) and executed on 31337; token allowlist replaced by the devnet token list via `findTokenFn`. The anvil chain is ephemeral, so these hashes are not verifiable after `down.sh`.
