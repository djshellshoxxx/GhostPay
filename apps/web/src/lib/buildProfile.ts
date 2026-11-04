import { createContext, useContext } from 'react';

declare const __GHOSTPAY_PROFILE__: 'full' | 'lean' | undefined;

export type BuildProfile = 'full' | 'lean';

/**
 * Local build profile, injected at compile time by vite.config.ts (`define`) from GHOSTPAY_LOCAL_BUILD_PROFILE.
 * vite.config pins it to 'full' under Vitest so unit tests do not depend on the shell environment.
 * Fails closed: a bundle built without the constant is treated as lean (the narrower, invoice-bound behaviour).
 */
export const BUILD_PROFILE: BuildProfile = typeof __GHOSTPAY_PROFILE__ === 'undefined' ? 'lean' : __GHOSTPAY_PROFILE__;

/** Profile of the rendering shell (AppShell provides it); undefined outside a shell. */
export const ShellProfileContext = createContext<BuildProfile | undefined>(undefined);

/**
 * Effective profile for a component. An explicit prop wins (tests); otherwise lean applies if either the shell or the
 * compiled build says lean, so a mismatch between them never widens behaviour.
 */
export function useEffectiveProfile(explicit?: BuildProfile): BuildProfile {
  const shell = useContext(ShellProfileContext);
  if (explicit !== undefined) return explicit;
  return shell === 'lean' || BUILD_PROFILE === 'lean' ? 'lean' : 'full';
}
