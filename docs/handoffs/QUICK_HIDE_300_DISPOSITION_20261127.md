# Quick-hide #300 donor disposition — 2026-11-27

Source pins: donor #300 `137628961463fc5abd8b7927b2efe6b18a0a206a`; main `fd5e591151765b2dafe6345501ca40393e0f176a`; main PrivacyControls blob `69e42c41efc77cfa9452ba71abcaf762a7c4b9f1`; SensitiveContent blob `f9c14f85b3aac1f599b5f04a6da6b54559d777ef`. Owner scope and shared-core privacy retention apply. No production changes.

The integrated #708 design uses the mounted PrivacyControls, not the donor's separate PrivacyQuickHide. Existing AppShell.masking.test.tsx covers button hiding, draft survival, shortcut and macOS physical-key behavior; the new separate test file preserves additional donor assertions without overlapping #742's masking/focus files.

| Donor intent | Disposition in this candidate |
| --- | --- |
| Independent PrivateHistory reveal and unlock | Not applicable to #708's design; no PrivateHistory component on current main. Do not reintroduce it. |
| One-way button and accessible keyboard affordance | Adapted: actual button changes to the deliberate reveal action after hide. Repeated shortcut remains one-way; explicit reveal restores the same draft. |
| Disabled mode | Adapted: no hide button, no consumed key event, draft remains visible. |
| Unrelated typing, modifiers, composition, repetition | All nine donor parameter cases retained. |
| Already handled key event | Adapted, retains no-hide assertion. |
| Listener removal | Adapted for actual control unmount and mode disable, including remount control. |
| Active shell draft, focus, unchanged preferences and seller state | Adapted to mounted Create invoice path, global privacy preference and real portal behavior; exact input node/value and seller public session retained. No key bytes inspected or logged. |

The old donor's repeated click on its permanent hide-only button is not equivalent to clicking the newly labeled deliberate reveal control in #708. The independent history assertions refer to an unmounted design and are not silently counted as passing. Source comparison only at publication; native Vitest/build/lint/browser tests not yet executed in this worker. Keep donor branch and PR open pending exact-head hosted qualification, independent review and coordinated disposition. No deployment, real funds, changes to stopped modules, or main merge.
