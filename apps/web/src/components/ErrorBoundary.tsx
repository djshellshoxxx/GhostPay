import { Component, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { Notice } from './Common';

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** A shown error clears when this changes. App passes the current view, so the navigation leaves a failed view. */
  readonly resetKey?: unknown;
  /** "Back to Home": leave the failed view (App: drop the open invoice and show Home). The error clears after it. */
  readonly onBack: () => void;
  /** Reloads the page; injectable for tests. */
  readonly reload?: () => void;
}

interface ErrorBoundaryState {
  readonly failed: boolean;
  readonly resetKey: unknown;
}

/**
 * Catches a render error in the views below it and shows a fixed error panel, so React does not unmount the whole app
 * (G1-01). The error is not shown or logged here: it may carry invoice text or a link.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { failed: false, resetKey: this.props.resetKey };

  public static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true };
  }

  public static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    return Object.is(props.resetKey, state.resetKey) ? null : { failed: false, resetKey: props.resetKey };
  }

  private readonly back = (): void => {
    this.props.onBack();
    this.setState({ failed: false });
  };

  public override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <ErrorPanel onBack={this.back} reload={this.props.reload ?? (() => { window.location.reload(); })} />;
  }
}

function ErrorPanel(props: { readonly onBack: () => void; readonly reload: () => void }): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <section className="panel" aria-label={t('errorBoundary.title')}>
      <Notice kind="error" title={t('errorBoundary.title')}>
        {t('errorBoundary.body')}
      </Notice>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={props.onBack}>{t('errorBoundary.back')}</button>
        <button type="button" className="btn" onClick={props.reload}>{t('errorBoundary.reload')}</button>
      </div>
      <p className="hint">{t('errorBoundary.reloadHint')}</p>
    </section>
  );
}
