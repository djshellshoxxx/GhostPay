"""Produce a source-pinned, observational review, never a gate allowlist."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parent / 'GhostPay-policy-client'
SOURCE = '198aa5baff22272453733a0f3dcfcac0e0994eec'
raw = (HERE / 'report.log').read_bytes()
text = raw.decode()
decoder = json.JSONDecoder()
reports = []
cursor = 0
while True:
    start = text.find('{', cursor)
    if start < 0:
        break
    try:
        report, size = decoder.raw_decode(text[start:])
    except json.JSONDecodeError:
        cursor = start + 1
        continue
    cursor = start + size
    if isinstance(report, dict) and 'issues' in report:
        reports.append((report, len(text[:start].encode()), len(text[start:cursor].encode())))
assert len(reports) == 5
names = ['GhostPayRouter', 'GhostPaySweepRelayer', 'GhostPayPolicyRouter', 'PolicyAccount', 'PolicyAccountFactory']
replay_path = HERE / 'mythril-current-concrete-replay.json'
replay = json.loads(replay_path.read_text())
assert len(replay['findings']) == 11
replay_by_position = {(x['reportIndex'], x['issueIndex']): x for x in replay['findings']}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()

def git(*args):
    return subprocess.check_output(['git', '-C', str(REPO), *args]).strip()

def source_file(path):
    data = subprocess.check_output(['git', '-C', str(REPO), 'show', f'{SOURCE}:{path}'])
    return {'path': path, 'gitBlob': git('rev-parse', f'{SOURCE}:{path}').decode(), 'sha256': sha(data)}, data

expiry_test = 'packages/contracts/test/MythrilExpiryDispositions.t.sol'
factory_test = 'packages/contracts/test/MythrilFactoryDispositions.t.sol'
expiry_doc = 'docs/audits/mythril-14290880802-expiry-dispositions.md'
factory_doc = 'docs/audits/mythril-14290880802-factory-dispositions.md'
test_text = {p: (REPO / p).read_text() for p in [expiry_test, factory_test]}

def tests(path, names):
    result = []
    for name in names:
        assert re.search(r'function\s+' + re.escape(name) + r'\s*\(', test_text[path]), name
        result.append({'path': path, 'test': name, 'locallyPassedIn445Snapshot': not name.startswith('testFuzz_'), 'origin': 'Existing historical evidence test; not a byte-identical replay of this fresh report unless the separate fresh replay says so'})
    return result

review = {
    'EXP-1': {
        'classification': 'intended_expiry_with_timestamp_assumptions',
        'assessment': 'The reported predicate is the inclusive deadline of a signed sweep order, not a randomness source. The supplied current call reverts InvalidAmount at timestamp 0. This is fresh concrete evidence; the current calldata is not described as the all-zero historical calldata.',
        'productionReachability': 'Valid owner-signed sweeps are accepted only at or before their signed deadline, then remain subject to signature, nonce, address, amount and exact-transfer checks. Producer-selected timestamp can affect inclusion near the boundary.',
        'confirmedRisk': 'No unauthorized transfer is demonstrated. Timestamp latitude and transaction inclusion/censorship remain assumptions; this finding does not prove their bounds.',
        'conditions': ['Keep the signed deadline and replay-domain checks', 'Do not reinterpret timestamp as randomness'],
        'decisionIds': ['MYTHRIL-DISPOSITION-POLICY'],
        'tests': tests(expiry_test, ['test_exp1_mythrilCounterexample_bothBranchesRevertWithoutEffect', 'test_exp1_oneSecondBeforeDeadline_sweeps', 'test_exp1_atDeadline_inclusiveOnBothEntryPoints', 'test_exp1_oneSecondAfterDeadline_revertsOnBothEntryPointsWithoutEffect', 'test_exp1_wrongChainOrRelayerAtDeadline_revertsInvalidSignature', 'testFuzz_exp1_producerTimestampOnlyGatesAcceptance']),
    },
    'EXP-2': {
        'classification': 'intended_expiry_with_timestamp_assumptions',
        'assessment': 'The predicate bounds signed withdrawal-request submission. A successful accepted request starts the full withdrawal delay; submission expiry is not execution expiry. The exact current request has amount 0 and reverts ZeroAmount at timestamp 0 in the fresh replay.',
        'productionReachability': 'A valid request still requires the owner signature, nonce, valid bound limit leaf and proof. The model deploys the self-locked implementation, not an initialized factory clone. Deadline semantics are also covered on valid clones by existing tests.',
        'confirmedRisk': 'No unauthorized withdrawal is demonstrated by this trace. The minimum policy reaction window under L2 censorship/timestamp assumptions remains an open owner decision.',
        'conditions': ['Keep authorization and nonce checks', 'Preserve full delay after acceptance'],
        'decisionIds': ['MYTHRIL-DISPOSITION-POLICY', 'OD11-TIMELOCK-BOUND'],
        'tests': tests(expiry_test, ['test_exp2_exp3_implementationModelNeverPassesAuthorization', 'test_exp2_mythrilCounterexample_bothBranchesRevertWithoutEffect', 'test_exp2_atDeadline_inclusiveAndStartsFullDelay', 'test_exp2_deadlineBoundsSubmissionNotExecution', 'test_exp2_lateAcceptedRequestStaysCancellableForFullDelay', 'test_exp2_wrongChainOrCloneAtDeadline_revertsInvalidSignature', 'testFuzz_exp2_producerTimestampOnlyGatesAcceptance']),
    },
    'EXP-3': {
        'classification': 'intended_expiry_with_timestamp_assumptions',
        'assessment': 'The predicate bounds signed destination-proposal submission. Activation remains delayed by twice the account delay. The exact current calldata has zero newDestination and a far-future deadline; the fresh replay reverts InvalidDestination at timestamp 0.',
        'productionReachability': 'Valid proposals require the owner signature, nonce and an eligible destination. The raw model deploys the self-locked implementation; valid-clone boundary tests provide separate evidence.',
        'confirmedRisk': 'No unauthorized destination change is demonstrated. Minimum reaction/cancellation time on each L2 is not established by this trace or these tests.',
        'conditions': ['Keep owner signature and nonce binding', 'Preserve full activation delay after acceptance'],
        'decisionIds': ['MYTHRIL-DISPOSITION-POLICY', 'OD11-TIMELOCK-BOUND'],
        'tests': tests(expiry_test, ['test_exp2_exp3_implementationModelNeverPassesAuthorization', 'test_exp3_mythrilCounterexample_bothBranchesRevertWithoutEffect', 'test_exp3_atDeadline_inclusiveAndStartsFullTimelock', 'test_exp3_deadlineBoundsSubmissionNotExecution', 'test_exp3_lateAcceptedProposalStaysCancellableForFullTimelock', 'test_exp3_wrongChainAtDeadline_revertsInvalidSignature', 'testFuzz_exp3_producerTimestampOnlyGatesAcceptance']),
    },
    'R4': {
        'classification': 'constrained_symbolic_clone_exception',
        'assessment': 'The record names a modeled clone address, has no filename/line, and reports PC30 as an exception. In a concrete standard EIP-1167 clone PC30 is GAS and PC31 is DELEGATECALL. The fresh model constructor is independently rejected with ImplementationHasNoCode because implementation=0x1.',
        'productionReachability': 'The supplied creation-to-fallback trace cannot arise through the current constructor on a real EVM. Separate valid-implementation tests verify exact clone runtime, fallback/receive and initialization authority.',
        'confirmedRisk': 'No concrete panic/assert failure is demonstrated. This is a source/model-specific constraint, not a universal SWC-110 dismissal.',
        'conditions': ['Implementation must have code', 'Clone runtime and initialization authorization must remain unchanged'],
        'decisionIds': ['MYTHRIL-DISPOSITION-POLICY'],
        'tests': tests(factory_test, ['test_R4_cloneRuntimeIsExactEip1167_pc30IsGasNotInvalid', 'test_R4_mythrilCloneAccountAddressIsCreateNonceZeroOfModelFactory', 'test_R4_mythrilImplementationModelIsRejectedByConstructor', 'test_R4_cloneFallbackRevertsWithoutPanic_receiveAccepts', 'test_R4_R5_doubleInitAndImplementationInitRevert']),
    },
    'R5': {
        'classification': 'guarded_fee_then_initialize_ordering',
        'assessment': 'The source really calls initialize after an external fee-token call. deploy is nonReentrant throughout, the clone is freshly created from a fixed implementation, and production initialize makes no external call. The current raw constructor additionally fails ImplementationHasNoCode.',
        'productionReachability': 'The fee-first ordering is reachable with a valid factory. Tested hostile-token callbacks cannot reenter, initialize the future clone, hijack it or block it by prefunding. A later failure rolls back the fee and clone atomically.',
        'confirmedRisk': 'No reentrant account-parameter or custody modification is demonstrated under the stated guard and implementation conditions. Fee-token availability remains a distinct N1 risk.',
        'conditions': ['nonReentrant remains on deploy', 'initialize has no external call and enforces creator-bound initialization', 'The implementation used in production matches the verified code'],
        'decisionIds': ['MYTHRIL-DISPOSITION-POLICY'],
        'tests': tests(factory_test, ['test_R5_R9_reentrantFeeTokenCannotReenterBeforeCreate2OrInitialize', 'test_R5_R9_feeCallbackCannotPreInitialiseHijackOrBlockTheClone', 'test_R5_initializeFailureAfterFeePullRollsBackFee', 'test_R5_foreignCloneCannotBeInitialisedByThirdParty', 'test_R5_initializeIssuesNoExternalCallBelowTheClone', 'test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites']),
    },
    'R6': {
        'classification': 'guard_release_misattributed_by_source_map',
        'assessment': 'The reported persistent write at PC1170 releases the reentrancy guard after initialization. The optimizer maps it to the ENTERED source line, so the source quote alone would be misleading. The fresh raw constructor fails ImplementationHasNoCode.',
        'productionReachability': 'Releasing the guard after a successful deployment is intended. Tests show it remains held during initialize, a callback is refused, and a later deployment can run.',
        'confirmedRisk': 'No unguarded reentrant window is demonstrated by this record.',
        'conditions': ['Keep guard entry before all external calls and release after initialize'],
        'decisionIds': ['MYTHRIL-DISPOSITION-POLICY'],
        'tests': tests(factory_test, ['test_R6_guardIsHeldDuringInitialize_reentryFromCloneReverts', 'test_R6_feeFreeDeployMakesNoTokenCallAndReleasesGuard', 'test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites']),
    },
    'R7': {
        'classification': 'confirmed_conditional_fee_token_availability_risk',
        'assessment': 'balanceOf(FEE_RECIPIENT) follows another token read. Reverting reads cause the real fee-charging factory to fail closed. The supplied fresh symbolic constructor is infeasible, but that does not dismiss the independently demonstrated availability dependency.',
        'productionReachability': 'Reachable if the immutable configured fee token starts reverting in a view or succeeds with a wrong balance delta. Every fee-charging deployment through that factory can fail, locking prefunded counterfactual funds until token behavior is restored.',
        'confirmedRisk': 'N1 conditional counterfactual-fund freeze. There is no alternate-factory rescue for the same CREATE2 address. The transfer-failure waiver covers neither failing views nor successful wrong-delta transfers.',
        'conditions': ['Operational token-specific acknowledgement does not prove token safety or eliminate the freeze', 'A zero-fee factory skips token calls'],
        'decisionIds': ['MYTHRIL-DISPOSITION-POLICY', 'N1-FEE-TOKEN-FREEZE'],
        'tests': tests(factory_test, ['test_R7_recipientBalanceOfRevertFailsClosedWithFullRollback', 'test_R7_R8_feeReadsAreStaticCalls_mutatingReadsFailClosed', 'test_R7_R8_feeTokenWithoutCodeFailsClosed_feeFreeFactoryUnaffected']),
    },
    'R8': {
        'classification': 'confirmed_conditional_fee_token_availability_risk',
        'assessment': 'allowance(msg.sender,address(this)) follows token balance reads. The fresh trace contains two byte-identical deploy calls; the real second successful replay would stop at AlreadyDeployed before token reads. The raw constructor also fails ImplementationHasNoCode. Neither constraint removes the genuine first-deployment fee-token dependency.',
        'productionReachability': 'A reverting allowance read on a valid fee token prevents deployment with atomic rollback. The same N1 counterfactual-fund freeze applies; later token changes can make an earlier safe factory unusable.',
        'confirmedRisk': 'N1 availability risk is real and conditional. The exact three-step trace is not a demonstrated successful exploit. This finding is present in the current report even though an earlier main report omitted it.',
        'conditions': ['Do not infer first-call success from the symbolic sequence', 'Operational token acknowledgement is not a recovery mechanism'],
        'decisionIds': ['MYTHRIL-DISPOSITION-POLICY', 'N1-FEE-TOKEN-FREEZE'],
        'tests': tests(factory_test, ['test_R8_allowanceRevertFailsClosedWithFullRollback', 'test_R7_R8_feeReadsAreStaticCalls_mutatingReadsFailClosed', 'test_replay_R7_R8_secondIdenticalDeployRevertsBeforeAnyTokenCall']),
    },
    'R9': {
        'classification': 'guarded_fee_then_create2_ordering',
        'assessment': 'CREATE2 follows the fee-token call by design. The held reentrancy guard and deterministic salt/implementation bind the resulting account. The fresh trace shares its constructor and deploy input with R5; the constructor fails ImplementationHasNoCode.',
        'productionReachability': 'A third party may pay to deploy the same victim policy, but cannot substitute owner/policy or make the victim pay. Failure after the fee call reverts atomically; another factory cannot occupy this factory-bound address.',
        'confirmedRisk': 'No attacker-controlled account substitution is demonstrated. Availability and token-waiver risks are separately recorded.',
        'conditions': ['Keep nonReentrant and deterministic deployment/initialization binding'],
        'decisionIds': ['MYTHRIL-DISPOSITION-POLICY'],
        'tests': tests(factory_test, ['test_R5_R9_reentrantFeeTokenCannotReenterBeforeCreate2OrInitialize', 'test_R9_create2FailureAfterFeeCallRevertsAtomically', 'test_R9_frontRunSameSaltDeploysVictimPolicy_victimPaysNothing', 'test_R9_otherFactoryWithSameImplementationCannotOccupyAddress']),
    },
    'R10': {
        'classification': 'constructor_selected_token_not_per_call_target',
        'assessment': 'The flagged call target is immutable FEE_TOKEN, chosen when constructing the factory, not owner/destination or another address controlled by a deploy caller. The fresh symbolic constructor sets FEE_TOKEN to the modeled attacker and implementation to no-code address0x1; the latter is rejected concretely.',
        'productionReachability': 'A malicious configured token can block deployments or grant fee waivers, but the tested guard prevents reentry and the caller cannot change the token per deployment. The trust assumption belongs to token selection and deployment policy.',
        'confirmedRisk': 'The per-deploy arbitrary-target premise is false. A constructor-selected malicious or changeable fee token is a real N1/fee-revenue risk, not cleared by this disposition.',
        'conditions': ['FEE_TOKEN stays immutable', 'Choose a suitable token without sender hooks', 'Keep exact caller/deployer distinctions in the disposition'],
        'decisionIds': ['MYTHRIL-DISPOSITION-POLICY', 'N1-FEE-TOKEN-FREEZE', 'FEE-TOKEN-SENDER-HOOKS'],
        'tests': tests(factory_test, ['test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites', 'testFuzz_R10_callTargetsAreFixedForAnyCallerInput', 'test_replay_R5_R9_R10_attackerTokenWithMythrilArguments']),
    },
    'R11': {
        'classification': 'checked_return_value_with_intentional_waiver',
        'assessment': 'SafeERC20 consumes call success and the returned bool/no-return-data rule; the factory branches on that result. Success after a clean failure is the deliberate fee waiver, not an unchecked return value. The fresh raw constructor also fails ImplementationHasNoCode.',
        'productionReachability': 'When a transfer fails without changing payer/recipient balances or allowance and the caller could pay, the account can deploy without the fee. Insufficient funds/allowance or mutated balances revert. Sender-hook tokens can let the caller veto payment; extremely gas-hungry tokens can reach a gas-starvation waiver.',
        'confirmedRisk': 'Conditional fee-revenue loss is documented and tested, including caller-controlled sender hooks and pathological gas use. This trace does not show unauthorized account custody. Historical gas measurements are token/proxy/limitsRoot-specific and are not universal thresholds or fresh measurements.',
        'conditions': ['Keep all before/after balance and allowance checks', 'Keep exact SafeERC20 return handling', 'Do not use fee tokens with sender hooks'],
        'decisionIds': ['MYTHRIL-DISPOSITION-POLICY', 'FEE-TOKEN-SENDER-HOOKS'],
        'tests': tests(factory_test, ['test_R11_falseReturnWithFunds_waivesWithoutAnyBalanceChange', 'test_R11_falseReturnWithoutFunds_revertsFeeTransferFailed', 'test_R11_noReturnDataToken_collectsExactFee_insufficientAllowanceReverts', 'test_R11_nonCanonicalTrue_movingFundsReverts_notMovingWaives', 'test_R11_revertingTransferWithReturnDataBomb_waivesWithBoundedCopy', 'test_R11_revertingTransferWithInsufficientAllowance_doesNotWaive', 'test_R11_gasStarvationOfOrdinaryFeeTransferNeverWaives', 'test_R11_residual_gasHungryFeeTokenCanBeStarvedIntoWaiver', 'test_replay_R11_twoCallerSequenceWaivesOnlyBecauseTokenReturnsFalse']),
    },
}

ids = {(1, 0): 'EXP-1', (3, 0): 'EXP-2', (3, 1): 'EXP-3'}
ids.update({(4, i): f'R{i+4}' for i in range(8)})
findings = {}
source_files = {}
for ri, (report, offset, size) in enumerate(reports):
    assert report['success'] is True and report['error'] is None
    for ii, issue in enumerate(report['issues']):
        ident = ids[(ri, ii)]
        key = f"{issue['contract']}|SWC-{issue['swc-id']}|PC-{issue['address']}"
        q = {k: v for k, v in issue.items() if k != 'tx_sequence'}
        filename = issue.get('filename')
        path = None
        if filename:
            path = 'packages/contracts/' + (filename.split('/packages/contracts/', 1)[1] if '/packages/contracts/' in filename else filename)
            meta, data = source_file(path)
            source_files[path] = meta
            start, length = map(int, issue['sourceMap'].split(':')[:2])
            snippet = data[start:start+length].decode()
            q['sourceSliceMatchesReportedCode'] = snippet == issue['code']
            assert q['sourceSliceMatchesReportedCode'], (ident, snippet, issue['code'])
            q['normalizedSourcePath'] = path
        traces = []
        for si, step in enumerate(issue['tx_sequence']['steps']):
            entry = {k: step[k] for k in ['address', 'name', 'origin', 'value']}
            entry.update({'stepIndex': si, 'inputBytes': len(step['input'].removeprefix('0x')) // 2, 'inputUtf8Sha256': sha(step['input'].encode()), 'calldataUtf8Sha256': sha(step['calldata'].encode())})
            if si:
                entry['inputHex'] = step['input']
                entry['resolvedInputFromMythril'] = step.get('resolved_input')
            elif ri == 4:
                fields = [step['calldata'][x:x+64] for x in range(0, 256, 64)]
                entry['constructorArgumentsDecodedFromFirst128CalldataBytes'] = {'implementation': '0x'+fields[0][-40:], 'feeToken': '0x'+fields[1][-40:], 'flatFee': str(int(fields[2], 16)), 'feeRecipient': '0x'+fields[3][-40:]}
                assert int(fields[0], 16) == 1
            traces.append(entry)
        findings[key] = {
            'historicalLabelForSameLocation': ident,
            'analyzedContract': names[ri], 'reportIndex': ri, 'issueIndex': ii,
            'reportObjectByteOffset': offset, 'reportObjectByteLength': size,
            'issueCanonicalJsonSha256': sha(canonical(issue)),
            'traceCanonicalJsonSha256': sha(canonical(issue['tx_sequence'])),
            'observation': q, 'traceSteps': traces,
            'freshConcreteReplay': replay_by_position[(ri, ii)],
            'review': review[ident],
            'priorDispositionDocument': expiry_doc if ri != 4 else factory_doc,
            'approval': {'approved': False, 'gateExceptionAuthorized': False, 'suppress': False, 'status': 'source review and counterevidence only'},
        }

old_path = 'docs/handoffs/pages-completion-20261118/evidence/hosted/HOSTED_MYTHRIL_REVIEW_20261118.json'
old = json.loads((REPO / old_path).read_text())
old_keys = {f"{x['contract']}|SWC-{x['swc-id']}|PC-{x['address']}" for x in old['issues']}
current_keys = set(findings)
for path in [expiry_test, factory_test, 'packages/contracts/src/PolicyAccount.sol', 'packages/contracts/src/PolicyAccountFactory.sol', 'packages/contracts/scripts/run-mythril.sh', 'packages/contracts/scripts/mythril-compat.py']:
    meta, _ = source_file(path)
    source_files[path] = meta

out = {
    'schemaVersion': 1, 'documentType': 'observational-finding-dispositions-not-gate-policy',
    'reviewer': 'contract_security', 'reviewDate': '2026-11-19',
    'analyzedSourceCommit': SOURCE, 'reviewWorkspaceBase': git('rev-parse', 'HEAD').decode(),
    'sourceTreeObjects': {'contractsSrc': git('rev-parse', f'{SOURCE}:packages/contracts/src').decode(), 'contractsLib': git('rev-parse', f'{SOURCE}:packages/contracts/lib').decode()},
    'provenance': {
        'runId': 44342340082, 'jobId': 134935409285, 'artifactId': 14462654594,
        'jobUrl': 'https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340082/job/134935409285',
        'reportBytes': len(raw), 'reportSha256': sha(raw),
        'artifactZipSha256': sha((HERE / 'mythril-198aa5ba.zip').read_bytes()),
        'metadata': json.loads((HERE / 'metadata.json').read_text()),
        'tool': {'mythril': '0.24.8', 'solc': '0.8.28', 'transactions': 3, 'executionTimeoutSecondsPerContract': 900, 'optimizerRuns': 200, 'evmVersion': 'cancun'},
        'freshLocalSymbolicCampaignPerformed': False,
    },
    'gate': {'hostedConclusion': 'failure', 'runnerExitCode': 1, 'findings': 11, 'medium': 3, 'low': 8, 'approvedDispositions': 0, 'runnerOrPolicyChanged': False, 'releaseBlockerRemains': True},
    'reports': [{'reportIndex': i, 'analyzedContract': names[i], 'success': r['success'], 'error': r['error'], 'issueCount': len(r['issues']), 'byteOffset': o, 'byteLength': n} for i, (r, o, n) in enumerate(reports)],
    'identityComparison': {
        'earlierMainCommit': old['hosted_main_sha'], 'earlierMainReportSha256': old['report_sha256'], 'earlierMainEvidencePath': old_path,
        'bothHave11Findings': len(old_keys) == len(current_keys) == 11,
        'currentOnly': sorted(current_keys - old_keys), 'earlierMainOnly': sorted(old_keys - current_keys),
        'interpretation': 'Equal counts do not establish identity. Current report restores SWC113 PC1781 and omits the earlier main SWC113 PC999 record. Matching location keys still do not imply byte-identical traces; exact current hashes and inputs are retained per finding.',
    },
    'freshConcreteReplay': {'path': str(replay_path), 'sha256': sha(replay_path.read_bytes()), 'harnessPath': str(HERE / 'replay-current-mythril.py'), 'harnessSha256': sha((HERE / 'replay-current-mythril.py').read_bytes()), 'anvilVersion': replay['anvilVersion'], 'stateModel': replay['stateModel'], 'timestampForExpiryCalls': 0, 'findingsReplayed': 11, 'limits': 'Exact current inputs were run on a disposable concrete EVM. Actor balances were funded locally; Mythril actor storage/balances were not injected. This is not a complete symbolic campaign, production-chain test, or proof over arbitrary inputs.'},
    'existingTestQualification': {'command': "forge snapshot --offline --check --no-match-test 'testFuzz|invariant'", 'logPath': str(HERE / 'policy-gas.log'), 'logSha256': sha((HERE / 'policy-gas.log').read_bytes()), 'allNonFuzzTestsPassed': 445, 'relevantNonFuzzTestsPassed': {'MythrilExpirySweepTest': 9, 'MythrilExpiryPolicyTest': 19, 'MythrilFactoryDispositionsTest': 32}, 'fuzzAndInvariantsRunInThisCheck': False, 'fullForgeAttempt': 'Compilation killed by SIGKILL; no full-suite qualification claimed', 'tool': 'Forge 1.8.5 51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f; solc0.8.28+commit.7893614a'},
    'ownerDecisions': {
        'MYTHRIL-DISPOSITION-POLICY': {'owner': 'repository/security owner', 'status': 'unapproved', 'decisionRequired': 'Approve a finding-specific, source/bytecode/tool-bound disposition mechanism after independent review, or keep the strict release gate red. Existing candidate checker is not authorization. No SWC-wide suppression, count-based acceptance or ignore-failures change is approved.', 'source': [expiry_doc, factory_doc, 'docs/handoffs/consolidation-20261118/NEXT_PHASE_QUEUE.md']},
        'N1-FEE-TOKEN-FREEZE': {'owner': 'scheme-2 deployment/protocol owner', 'status': 'open before production scheme-2 deployment', 'decisionRequired': 'Choose a zero-fee factory for upgradeable or fee-switchable tokens, or explicitly approve and specify a protocol change addressing view/wrong-delta failures. Existing token-specific FEE_TOKEN_FREEZE_ACK safeguards nonzero-fee deployments but neither removes the freeze nor authorizes real-funds use.', 'recoveredSafeguardCommits': ['c0d718578fb4aa855ffcd4a87241a5efabf9732f', 'cff088d69c0f2731722894ee8835164b3ec8b221'], 'source': [factory_doc, 'docs/operators/deployment-runbook.md', 'packages/contracts/README.md']},
        'OD11-TIMELOCK-BOUND': {'owner': 'policy product/protocol owner', 'status': 'open', 'decisionRequired': 'Establish per-network producer/sequencer delay and cancellation-inclusion assumptions before accepting the 1-hour withdrawal / 2-hour destination-change minima for production. No numerical floor or new authority is chosen in this recovery.', 'source': [expiry_doc]},
        'FEE-TOKEN-SENDER-HOOKS': {'owner': 'factory deployer/token policy owner', 'status': 'existing operational restriction; token-specific suitability unproved', 'decisionRequired': 'Exclude fee tokens with sender-controlled transfer hooks and assess immutable token behavior, upgrade controls and waiver revenue consequences. The deployment script cannot prove absence of hooks.', 'source': ['docs/audits/26-contract-security-review-2026-11.md', factory_doc]},
    },
    'sourceFiles': source_files, 'findingsByContractSwcPc': findings,
    'limitations': ['Zero findings in the two router reports do not prove absence of vulnerabilities; analogous timestamp guards exist there.', 'Raw concrete trace infeasibility does not dismiss independently reachable fee-token freeze/revenue risks.', 'Existing historical replay and mutation tests are counterevidence, not owner approval or a comprehensive external audit.', 'No source PR, analyzer policy, SWC suppression, deployment configuration or production contract was modified by this review.'],
}
assert len(findings) == 11
assert out['identityComparison']['currentOnly'] == ['PolicyAccountFactory|SWC-113|PC-1781']
assert out['identityComparison']['earlierMainOnly'] == ['PolicyAccountFactory|SWC-113|PC-999']
dest = HERE / 'mythril-198aa5ba-dispositions.json'
dest.write_text(json.dumps(out, indent=2) + '\n')
print(json.dumps({'path': str(dest), 'bytes': dest.stat().st_size, 'sha256': sha(dest.read_bytes()), 'findings': len(findings), 'gate': out['gate'], 'comparison': out['identityComparison']}, indent=2))
