import { useEffect, useId, useRef, type ReactNode } from 'react';
import { subscribeAppLock } from '../lib/appLock';
import { UserFacingError, type DisplayMessage } from '../lib/errors';
import { GENERATED_PASSPHRASE_BITS, GENERATED_PASSPHRASE_WORDS, MAX_KEYSTORE_BYTES, generatePassphrase, passphraseProblemMessage, passphraseStrength, type PassphraseStrength } from '../lib/keystore';
import type { SecretExportCredential } from '../lib/keyVault';
import { captureSessionVersionGuard, subscribeSession } from '../lib/session';
import type { ScanMatch } from '../lib/scanClient';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/catalog';
import type { Translator } from '../i18n/translator';
import { Field } from './Common';

/** Shared pieces of the spec 18 export panels: credential and passphrase fields, and the operation lifecycle. */

export type ExportT = Translator['t'];

export function useExportT(): ExportT {
  return useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
}

/** The translator of the latest render, for text produced after an await (the language may have changed since). */
export function useLatestExportT(t: ExportT): { readonly current: ExportT } {
  const ref = useRef(t);
  ref.current = t;
  return ref;
}

export type ExportMessage = { readonly kind: 'ok' | 'error'; readonly text: DisplayMessage };

/** What the user typed or chose to prove they hold the loaded keys (formats section 7). */
export interface CredentialInput {
  readonly kind: 'vault' | 'keystore';
  readonly passphrase: string;
  readonly file: File | undefined;
}

export const EMPTY_CREDENTIAL: CredentialInput = { kind: 'vault', passphrase: '', file: undefined };

/** Reads the chosen keystore file only when the export starts; the file never leaves this tab. */
export async function readCredential(input: CredentialInput): Promise<SecretExportCredential> {
  if (input.kind === 'vault') return { kind: 'vault', passphrase: input.passphrase };
  if (input.file === undefined) throw new UserFacingError({ key: 'stealthExport.auth.chooseKeystore' });
  if (input.file.size > MAX_KEYSTORE_BYTES) throw new UserFacingError({ key: 'error.keystore.invalidFile' });
  return { kind: 'keystore', text: await input.file.text(), passphrase: input.passphrase };
}

export function credentialReady(input: CredentialInput): boolean {
  return input.passphrase !== '' && (input.kind === 'vault' || input.file !== undefined);
}

export function CredentialFields(props: { readonly value: CredentialInput; readonly onChange: (next: CredentialInput) => void; readonly disabled?: boolean }): ReactNode {
  const t = useExportT();
  const group = useId();
  const { kind, passphrase, file } = props.value;
  return (
    <fieldset className="stack" disabled={props.disabled === true}>
      <legend>{t('stealthExport.auth.legend')}</legend>
      <p className="hint">{t('stealthExport.auth.hint')}</p>
      <div className="check">
        <input id={`${group}-vault`} type="radio" name={`${group}-kind`} checked={kind === 'vault'} onChange={() => { props.onChange({ kind: 'vault', passphrase: '', file: undefined }); }} />
        <label htmlFor={`${group}-vault`}>{t('stealthExport.auth.vault')}</label>
      </div>
      <div className="check">
        <input id={`${group}-keystore`} type="radio" name={`${group}-kind`} checked={kind === 'keystore'} onChange={() => { props.onChange({ kind: 'keystore', passphrase: '', file: undefined }); }} />
        <label htmlFor={`${group}-keystore`}>{t('stealthExport.auth.keystore')}</label>
      </div>
      {kind === 'vault' ? (
        <Field label={t('stealthExport.auth.vaultPassphrase')}>
          {(id) => <input id={id} type="password" autoComplete="off" name="ghostpay-export-vault-step-up" value={passphrase} onChange={(e) => { props.onChange({ ...props.value, passphrase: e.target.value }); }} />}
        </Field>
      ) : (
        <>
          <Field label={t('stealthExport.auth.keystoreFile')}>{(id) => <>
            <input id={id} aria-describedby={file === undefined ? undefined : `${id}-file`} type="file" accept="application/json,.json" onChange={(e) => {
              const chosen = e.currentTarget.files?.[0]; e.currentTarget.value = '';
              if (chosen === undefined) return;
              props.onChange({ ...props.value, file: chosen });
            }} />
            {file !== undefined && <p className="hint" id={`${id}-file`}>{t('upload.selectedFile')}</p>}
          </>}</Field>
          <Field label={t('stealthExport.auth.keystorePassphrase')}>
            {(id) => <input id={id} type="password" autoComplete="off" name="ghostpay-export-keystore-step-up" value={passphrase} onChange={(e) => { props.onChange({ ...props.value, passphrase: e.target.value }); }} />}
          </Field>
        </>
      )}
    </fieldset>
  );
}

/** A new passphrase for an encrypted export file, typed twice; `suggested` is shown in clear only while untouched (L1-06). */
export interface NewPassphrase {
  readonly pass: string;
  readonly pass2: string;
  readonly suggested: string | undefined;
}

export const EMPTY_PASSPHRASE: NewPassphrase = { pass: '', pass2: '', suggested: undefined };

/** The keystore passphrase policy (length and strength estimator), then the repeat. */
export function newPassphraseProblem(value: NewPassphrase): DisplayMessage | undefined {
  const problem = passphraseProblemMessage(value.pass);
  if (problem !== undefined) return problem;
  if (value.pass !== value.pass2) return { key: 'sellerKeys.passphrasesDiffer' };
  return undefined;
}

const STRENGTH_KEYS: Readonly<Record<PassphraseStrength['label'], MessageKey>> = {
  'too short': 'stealthExport.pass.level.tooShort',
  weak: 'stealthExport.pass.level.weak',
  fair: 'stealthExport.pass.level.fair',
  good: 'stealthExport.pass.level.good',
  strong: 'stealthExport.pass.level.strong',
};

export function NewPassphraseFields(props: { readonly value: NewPassphrase; readonly onChange: (next: NewPassphrase) => void; readonly disabled?: boolean }): ReactNode {
  const t = useExportT();
  const { pass, pass2, suggested } = props.value;
  const showing = pass !== '' && pass === suggested;
  const level = STRENGTH_KEYS[passphraseStrength(pass).label];
  return (
    <>
      <Field label={t('stealthExport.pass.new')} {...(showing ? { hint: t('sellerKeys.suggested', { words: GENERATED_PASSPHRASE_WORDS, bits: GENERATED_PASSPHRASE_BITS }) } : {})}>
        {(id, d) => <input id={id} aria-describedby={d} disabled={props.disabled === true} type={showing ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} value={pass} onChange={(e) => { props.onChange({ ...props.value, pass: e.target.value }); }} />}
      </Field>
      {pass !== '' && <p className="hint" aria-live="polite">{t('stealthExport.pass.strength', { level: t(level) })}</p>}
      <p><button type="button" className="btn" disabled={props.disabled === true} onClick={() => { const next = generatePassphrase(); props.onChange({ pass: next, pass2: '', suggested: next }); }}>{t('stealthExport.pass.suggest')}</button></p>
      <Field label={t('stealthExport.pass.repeat')}>
        {(id) => <input id={id} type="password" disabled={props.disabled === true} autoComplete="new-password" value={pass2} onChange={(e) => { props.onChange({ ...props.value, pass2: e.target.value }); }} />}
      </Field>
    </>
  );
}

export interface ExportOperation {
  /** Cancels any running export of this panel and starts a new one. */
  readonly start: () => AbortController;
  readonly stop: () => void;
  /** The operation is still the panel's latest and was not cancelled; its result may be used. */
  readonly current: (controller: AbortController) => boolean;
}

/**
 * Operation token of one export panel (the SellerKeys onExport convention). Starting another operation, unmounting the
 * panel, the idle lock and every session change (wipe, key replacement, a new session revision) abort it, and `onReset`
 * clears what was typed. Result acceptance also checks the captured session revision and current input scope.
 * Aborted or obsolete results are discarded; lock notification cancels the pending operation.
 */
export function useExportOperation(onReset: () => void, scope: readonly unknown[] = []): ExportOperation {
  const operation = useRef<{ readonly controller: AbortController; readonly scope: readonly unknown[]; readonly unchanged: () => void } | null>(null);
  // Updated during render: an old promise cannot settle between a new input render and its cleanup effect.
  const latestScope = useRef(scope);
  latestScope.current = scope;
  const mounted = useRef(false);
  const reset = useRef(onReset);
  reset.current = onReset;
  const api = useRef<ExportOperation | null>(null);
  if (api.current === null) {
    const stop = (): void => { operation.current?.controller.abort(); operation.current = null; };
    api.current = {
      start: () => {
        stop();
        const unchanged = captureSessionVersionGuard();
        const controller = new AbortController();
        operation.current = { controller, scope: [...latestScope.current], unchanged };
        return controller;
      },
      stop,
      current: (controller) => {
        const pending = operation.current;
        if (!mounted.current || pending?.controller !== controller || controller.signal.aborted) return false;
        try { pending.unchanged(); }
        catch {
          // A session notification may already have cancelled and reset this operation.
          if (operation.current === pending) { stop(); reset.current(); }
          return false;
        }
        return mounted.current && operation.current === pending && !controller.signal.aborted &&
          pending.scope.length === latestScope.current.length && pending.scope.every((value, index) => value === latestScope.current[index]);
      },
    };
  }
  const ops = api.current;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; ops.stop(); };
  }, [ops]);
  useEffect(() => subscribeAppLock(() => { ops.stop(); reset.current(); }), [ops]);
  useEffect(() => subscribeSession(() => { ops.stop(); reset.current(); }), [ops]);
  return ops;
}

// i18n-use: stealthExport.pass.level.tooShort stealthExport.pass.level.weak stealthExport.pass.level.fair stealthExport.pass.level.good stealthExport.pass.level.strong stealthExport.auth.chooseKeystore

/** Public input identity for export consent. Bigints are encoded explicitly; no private material is inspected. */
export function exportSelectionIdentity(matches: readonly ScanMatch[]): string {
  return JSON.stringify(matches.map((match) => [
    match.chainId, match.stealthAddress, match.announcement,
  ]), (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
}
