// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IGhostPayShieldedPool} from "../../src/interfaces/IGhostPayShieldedPool.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

interface IAcceptW {
    function accept(uint256[9] calldata s) external;
}

interface IAcceptR {
    function accept(uint256[4] calldata s) external;
}

/// @notice Separate depositor identity (so foreign-ragequit attempts have a real victim).
contract EchidnaActor {
    function approve(IMintable t, address pool) external {
        t.approve(pool, type(uint256).max);
    }

    function deposit(IGhostPayShieldedPool pool, uint256 value, uint256 pre)
        external
        returns (uint256 c, uint256 l)
    {
        return pool.deposit(value, pre);
    }

    function ragequit(IGhostPayShieldedPool pool, IGhostPayShieldedPool.RagequitProof calldata p)
        external
    {
        pool.ragequit(p);
    }
}

/// @title EchidnaPool
/// @notice TEST ONLY. Property harness for GhostPayShieldedPoolERC20 with model (mock) verifiers.
/// The pool is constructed on a local anvil by `EchidnaFixture.s.sol` (Echidna's EVM runs at chain
/// id 1, which the pool constructor refuses) and reached through Echidna's RPC fork (`rpcUrl`).
/// Addresses below are the deterministic anvil account-0 CREATE addresses of that script.
/// Properties: value conservation, no double spend / stale root / foreign ragequit succeeds,
/// current root known. `echidna_canary_*` must FAIL (proves the harness reaches deep states).
contract EchidnaPool {
    uint256 internal constant P =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;
    IGhostPayShieldedPool internal constant POOL =
        IGhostPayShieldedPool(0xa513E6E4b8f2a923D98304ec87F64353C4D5C853);
    IMintable internal constant TOKEN = IMintable(0x0165878A594ca255338adfa4d48449f69242Eb8F);
    IAcceptW internal constant WV = IAcceptW(0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9);
    IAcceptR internal constant RV = IAcceptR(0x5FC8d32690cc91D4c39d9d3abcBD16989F875707);

    struct Note {
        uint256 value;
        uint256 label;
        uint256 commitment;
        uint256 nullifierHash;
        uint8 owner;
        bool spent;
    }

    EchidnaActor[2] internal actors;
    Note[] internal notes;
    uint256[] internal rootAtSize;
    uint256 internal baseSize;
    uint256 internal baseBalance;
    uint256 internal ghostUnspent;
    uint256 internal attackSuccesses;
    uint256 internal withdrawals;
    uint256 internal salt;

    constructor() {
        actors[0] = new EchidnaActor();
        actors[1] = new EchidnaActor();
        actors[0].approve(TOKEN, address(POOL));
        actors[1].approve(TOKEN, address(POOL));
        baseSize = POOL.currentTreeSize();
        baseBalance = TOKEN.balanceOf(address(POOL));
        rootAtSize.push(POOL.currentRoot());
    }

    function _fresh() internal returns (uint256) {
        return uint256(keccak256(abi.encode("e", salt++))) % P;
    }

    function _w(uint256 fee) internal view returns (IGhostPayShieldedPool.Withdrawal memory) {
        return IGhostPayShieldedPool.Withdrawal({
            recipient: address(0xBEEF),
            relayer: address(this),
            relayerFee: fee,
            feeTo: address(0xFEE),
            deadline: block.timestamp + 1 days,
            aspPublisher: address(0),
            announce: ""
        });
    }

    function _proof(
        IGhostPayShieldedPool.Withdrawal memory w,
        uint256 v,
        uint256 nh,
        uint256 c,
        uint256 root
    ) internal returns (IGhostPayShieldedPool.WithdrawProof memory pr) {
        pr.pubSignals = [
            c,
            nh,
            v,
            root,
            POOL.currentTreeDepth(),
            0,
            0,
            0,
            uint256(keccak256(abi.encode(w, POOL.SCOPE()))) % P
        ];
        WV.accept(pr.pubSignals);
    }

    function _pick(uint256 seed, bool wantSpent) internal view returns (bool, uint256) {
        uint256 n = notes.length;
        if (n == 0) return (false, 0);
        for (uint256 k; k < n; ++k) {
            uint256 i = (seed % n + k) % n;
            if (notes[i].spent == wantSpent && (wantSpent || notes[i].value > 0)) return (true, i);
        }
        return (false, 0);
    }

    function deposit(uint8 who, uint256 value) external {
        value = 1 + value % 1e20;
        uint8 o = who % 2;
        TOKEN.mint(address(actors[o]), value);
        (uint256 c, uint256 l) = actors[o].deposit(POOL, value, _fresh());
        notes.push(Note(value, l, c, _fresh(), o, false));
        ghostUnspent += value;
        rootAtSize.push(POOL.currentRoot());
    }

    function withdraw(uint256 seed, uint256 amount, uint256 feeSeed) external {
        (bool ok, uint256 i) = _pick(seed, false);
        if (!ok) return;
        Note memory n = notes[i];
        amount = 1 + amount % n.value;
        uint256 fee = feeSeed % (amount * 500 / 10_000 + 1);
        IGhostPayShieldedPool.Withdrawal memory w = _w(fee);
        uint256 c = _fresh();
        IGhostPayShieldedPool.WithdrawProof memory pr =
            _proof(w, amount, n.nullifierHash, c, POOL.currentRoot());
        POOL.withdraw(w, pr);
        notes[i].spent = true;
        ghostUnspent -= amount;
        withdrawals++;
        notes.push(Note(n.value - amount, n.label, c, _fresh(), n.owner, false));
        rootAtSize.push(POOL.currentRoot());
    }

    function ragequit(uint256 seed) external {
        (bool ok, uint256 i) = _pick(seed, false);
        if (!ok) return;
        Note memory n = notes[i];
        IGhostPayShieldedPool.RagequitProof memory rq;
        rq.pubSignals = [n.commitment, n.nullifierHash, n.value, n.label];
        RV.accept(rq.pubSignals);
        actors[n.owner].ragequit(POOL, rq);
        notes[i].spent = true;
        ghostUnspent -= n.value;
    }

    function attackDoubleSpend(uint256 seed, bool viaRagequit) external {
        (bool ok, uint256 i) = _pick(seed, true);
        if (!ok) return;
        Note memory n = notes[i];
        if (n.value == 0) return;
        if (viaRagequit) {
            IGhostPayShieldedPool.RagequitProof memory rq;
            rq.pubSignals = [n.commitment, n.nullifierHash, n.value, n.label];
            RV.accept(rq.pubSignals);
            try actors[n.owner].ragequit(POOL, rq) {
                attackSuccesses++;
            } catch {}
            return;
        }
        IGhostPayShieldedPool.Withdrawal memory w = _w(0);
        IGhostPayShieldedPool.WithdrawProof memory pr =
            _proof(w, n.value, n.nullifierHash, _fresh(), POOL.currentRoot());
        try POOL.withdraw(w, pr) {
            attackSuccesses++;
        } catch {}
    }

    function attackForeignRagequit(uint256 seed) external {
        (bool ok, uint256 i) = _pick(seed, false);
        if (!ok) return;
        Note memory n = notes[i];
        IGhostPayShieldedPool.RagequitProof memory rq;
        rq.pubSignals = [n.commitment, n.nullifierHash, n.value, n.label];
        RV.accept(rq.pubSignals);
        try actors[1 - n.owner].ragequit(POOL, rq) {
            attackSuccesses++;
        } catch {}
    }

    function attackStaleRoot(uint256 seed) external {
        uint256 len = rootAtSize.length;
        if (len <= 65) return;
        (bool ok, uint256 i) = _pick(seed, false);
        if (!ok) return;
        IGhostPayShieldedPool.Withdrawal memory w = _w(0);
        IGhostPayShieldedPool.WithdrawProof memory pr =
            _proof(w, 1, notes[i].nullifierHash, _fresh(), rootAtSize[len - 1 - 64]);
        try POOL.withdraw(w, pr) {
            attackSuccesses++;
        } catch {}
    }

    function echidna_value_conserved() external view returns (bool) {
        return TOKEN.balanceOf(address(POOL)) == baseBalance + ghostUnspent;
    }

    function echidna_no_attack_succeeds() external view returns (bool) {
        return attackSuccesses == 0;
    }

    function echidna_tree_size_tracks_inserts() external view returns (bool) {
        return POOL.currentTreeSize() == baseSize + rootAtSize.length - 1;
    }

    function echidna_current_root_known() external view returns (bool) {
        uint256 r = POOL.currentRoot();
        return r == 0 || POOL.isKnownRoot(r);
    }

    /// Expected to FAIL: shows the fuzzer reaches successful withdrawals.
    function echidna_canary_no_withdrawals() external view returns (bool) {
        return withdrawals == 0;
    }
}
