import { Fragment, type ReactNode } from 'react';
import type { MessageKey } from '../i18n/catalog';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageValues, Part } from '../i18n/message';

export type RichRenderers = Readonly<Record<string, (children: ReactNode) => ReactNode>>;

function toNodes(parts: readonly Part[], tags: RichRenderers): ReactNode[] {
  return parts.map((p, i) => {
    if (typeof p === 'string') return p;
    const inner = toNodes(p.children, tags);
    const wrap = tags[p.tag];
    return <Fragment key={i}>{wrap === undefined ? inner : wrap(inner)}</Fragment>;
  });
}

/**
 * Like Trans, but renders the English source text when no I18nProvider is mounted (isolated component tests).
 * Message and values are inserted as text nodes only; {#tag}...{/tag} markers map to the given renderers.
 */
export function RichText(props: { readonly id: MessageKey; readonly values?: MessageValues; readonly tags?: RichRenderers }): ReactNode {
  const parts = (useI18nOptional() ?? SOURCE_TRANSLATOR).parts;
  return <>{toNodes(parts(props.id, props.values), props.tags ?? {})}</>;
}
