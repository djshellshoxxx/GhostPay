import { Fragment, type ReactNode } from 'react';
import type { MessageKey } from './catalog';
import { useI18n } from './context';
import type { MessageValues, Part } from './message';

export type TagRenderers = Readonly<Record<string, (children: ReactNode) => ReactNode>>;

export interface TransProps {
  readonly id: MessageKey;
  readonly values?: MessageValues;
  /** Maps {#name}...{/name} markup in the message to elements. A tag without a renderer shows its text unwrapped. */
  readonly tags?: TagRenderers;
}

function toNodes(parts: readonly Part[], tags: TagRenderers): ReactNode[] {
  return parts.map((p, i) => {
    if (typeof p === 'string') return p;
    const inner = toNodes(p.children, tags);
    const wrap = tags[p.tag];
    return <Fragment key={i}>{wrap === undefined ? inner : wrap(inner)}</Fragment>;
  });
}

/**
 * Rich text without HTML: the catalog string contains {#tag}text{/tag} markers, the component supplies what each tag
 * renders as. Values and message text are always inserted as text nodes (React escapes them); there is no
 * dangerouslySetInnerHTML anywhere.
 */
export function Trans(props: TransProps): ReactNode {
  const { parts } = useI18n();
  return <>{toNodes(parts(props.id, props.values), props.tags ?? {})}</>;
}
