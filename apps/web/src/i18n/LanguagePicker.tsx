import { useId, type ReactNode } from 'react';
import { hasCatalog } from './catalog';
import { useI18n } from './context';
import { isReviewed, LANGUAGES, PSEUDO_LANGUAGES, SOURCE_LOCALE } from './languages';
import { AUTO } from './storage';

/**
 * Manual language choice. Each option is written in its own language (lang and dir set per option) and says whether
 * the translation is machine-drafted or missing. Works without scripting beyond React: it is a plain <select>.
 */
export function LanguagePicker(props: { readonly allowPseudo?: boolean }): ReactNode {
  const i18n = useI18n();
  const id = useId();
  const hintId = `${id}-hint`;
  const showPseudo = props.allowPseudo ?? import.meta.env.DEV;
  const list = showPseudo ? [...LANGUAGES, ...PSEUDO_LANGUAGES] : LANGUAGES;

  const note = (code: string): string | undefined => {
    if (code === SOURCE_LOCALE) return undefined;
    if (!hasCatalog(code)) return i18n.t('i18n.picker.noCatalog');
    return isReviewed(code) ? undefined : i18n.t('i18n.picker.machineDrafted');
  };

  return (
    <div className="field">
      <label htmlFor={id}>{i18n.t('i18n.picker.label')}</label>
      <select
        id={id}
        aria-describedby={hintId}
        value={i18n.preference}
        onChange={(e) => {
          i18n.setPreference(e.target.value);
        }}
      >
        <option value={AUTO}>{i18n.t('i18n.picker.auto')}</option>
        {list.map((l) => {
          const n = note(l.code);
          return (
            <option key={l.code} value={l.code} lang={l.code === 'en-XA' || l.code === 'en-XB' ? 'en' : l.code} dir={l.dir}>
              {n === undefined ? l.name : i18n.t('i18n.picker.option', { name: l.name, note: n })}
            </option>
          );
        })}
      </select>
      <p id={hintId} className="hint">
        {i18n.t('i18n.picker.hint')}
      </p>
      {i18n.status === 'error' && <p role="alert">{i18n.t('i18n.loadFailed')}</p>}
    </div>
  );
}

