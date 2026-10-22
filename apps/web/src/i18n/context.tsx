import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadLayers, type CatalogLayer, type CatalogLoader, defaultCatalogLoader, SOURCE_CATALOG } from './catalog';
import { AUTO, isValidPreference, loadPreference, savePreference, type LocalePreference } from './storage';
import { detectLocale, directionOf, fallbackChain, SOURCE_LOCALE, type Direction } from './languages';
import { createTranslator, type I18nIssue, type Translator } from './translator';

export type I18nStatus = 'ready' | 'loading' | 'error';

export interface I18nState extends Translator {
  /** What the user chose: 'auto' or a language code. */
  readonly preference: LocalePreference;
  /** The language actually in effect (what the detection or the choice resolved to). */
  readonly requestedLocale: string;
  readonly dir: Direction;
  readonly status: I18nStatus;
  /** False when browser storage refused the choice (it then applies until the page is closed). */
  readonly persisted: boolean;
  readonly setPreference: (value: LocalePreference) => void;
}

export interface I18nProviderProps {
  readonly children: ReactNode;
  /** Overrides navigator.languages (tests, embedding). */
  readonly languages?: readonly string[];
  /** Overrides the stored choice. */
  readonly initialPreference?: LocalePreference;
  readonly loader?: CatalogLoader;
  /** Development only by default: console warnings for missing keys and broken messages. */
  readonly onIssue?: (issue: I18nIssue) => void;
  /** Document whose lang and dir attributes follow the locale. Pass null to leave the document alone. */
  readonly target?: Pick<HTMLElement, 'setAttribute'> | null;
  readonly allowPseudo?: boolean;
}

const I18nContext = createContext<I18nState | undefined>(undefined);

function browserLanguages(): readonly string[] {
  try {
    const n = globalThis.navigator as Navigator | undefined;
    if (n === undefined) return [];
    return n.languages.length > 0 ? n.languages : [n.language];
  } catch {
    return [];
  }
}

function devWarn(issue: I18nIssue): void {
  if (!import.meta.env.DEV) return;
  console.warn(`[i18n] ${issue.kind}: ${issue.key} (${issue.locale})`);
}

export function I18nProvider(props: I18nProviderProps): ReactNode {
  const allowPseudo = props.allowPseudo ?? import.meta.env.DEV;
  const loader = props.loader ?? defaultCatalogLoader;
  const onIssue = props.onIssue ?? devWarn;
  const onIssueRef = useRef(onIssue);
  onIssueRef.current = onIssue;

  const [preference, setPref] = useState<LocalePreference>(() => {
    const given = props.initialPreference;
    return given !== undefined && isValidPreference(given, allowPseudo) ? given : loadPreference(allowPseudo);
  });
  const [persisted, setPersisted] = useState(true);
  const requested = useMemo(
    () => (preference === AUTO ? detectLocale(props.languages ?? browserLanguages()) : preference),
    [preference, props.languages],
  );
  // English is bundled, so the first render already has text; other catalogs replace it when they arrive.
  const [loaded, setLoaded] = useState<{ readonly locale: string; readonly layers: readonly CatalogLayer[] }>({
    locale: SOURCE_LOCALE,
    layers: [{ locale: SOURCE_LOCALE, messages: SOURCE_CATALOG.messages }],
  });
  const [status, setStatus] = useState<I18nStatus>(requested === SOURCE_LOCALE ? 'ready' : 'loading');

  useEffect(() => {
    if (requested === SOURCE_LOCALE) {
      setLoaded({ locale: SOURCE_LOCALE, layers: [{ locale: SOURCE_LOCALE, messages: SOURCE_CATALOG.messages }] });
      setStatus('ready');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    loadLayers(fallbackChain(requested), loader).then(
      (layers) => {
        if (cancelled) return;
        setLoaded({ locale: requested, layers });
        setStatus('ready');
      },
      () => {
        if (cancelled) return;
        setLoaded({ locale: SOURCE_LOCALE, layers: [{ locale: SOURCE_LOCALE, messages: SOURCE_CATALOG.messages }] });
        setStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requested, loader]);

  const effective = loaded.locale;
  const dir = directionOf(effective);
  const target = props.target === undefined ? (typeof document === 'undefined' ? null : document.documentElement) : props.target;
  useEffect(() => {
    if (target === null) return;
    target.setAttribute('lang', effective === 'en-XA' || effective === 'en-XB' ? 'en' : effective);
    target.setAttribute('dir', dir);
  }, [target, effective, dir]);

  const setPreference = useCallback(
    (value: LocalePreference): void => {
      if (!isValidPreference(value, allowPseudo)) return;
      setPersisted(savePreference(value));
      setPref(value);
    },
    [allowPseudo],
  );

  const value = useMemo<I18nState>(() => {
    const tr = createTranslator(effective, loaded.layers, { onIssue: (i) => { onIssueRef.current(i); } });
    return { ...tr, preference, requestedLocale: requested, dir, status, persisted, setPreference };
  }, [effective, loaded.layers, preference, requested, dir, status, persisted, setPreference]);

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const s = useContext(I18nContext);
  if (s === undefined) throw new Error('I18nProvider missing');
  return s;
}

/** The translate function: t('settings.title'), t('settings.rpc.test', { chain: 'Base' }). */
export function useT(): Translator['t'] {
  return useI18n().t;
}
