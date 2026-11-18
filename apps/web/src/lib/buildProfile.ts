import { createContext, useContext } from 'react';

declare const __GHOSTPAY_PROFILE__: unknown;

export type BuildProfile = 'full' | 'lean';

/** Parses the injected define. Fails closed: an absent or unknown value is treated as lean (the narrower behaviour). */
export function profileFromDefine(raw: unknown): BuildProfile {
  return raw === 'full' ? 'full' : 'lean';
}

/**
 * Local build profile, injected at compile time by vite.config.ts (`define`) from GHOSTPAY_LOCAL_BUILD_PROFILE.
 * vite.config pins it to 'full' under Vitest so unit tests do not depend on the shell environment.
 */
export const BUILD_PROFILE: BuildProfile = profileFromDefine(typeof __GHOSTPAY_PROFILE__ === 'undefined' ? undefined : __GHOSTPAY_PROFILE__);

/** Profile of the rendering shell (AppShell provides it); undefined outside a shell. */
export const ShellProfileContext = createContext<BuildProfile | undefined>(undefined);

/**
 * Narrow-only resolution: lean if any source (explicit prop, shell, compiled build) says lean. No source can widen
 * another, so `profile="full"` inside a lean shell or a lean build stays lean.
 */
export function resolveProfile(explicit: BuildProfile | undefined, shell: BuildProfile | undefined, build: BuildProfile): BuildProfile {
  return explicit === 'lean' || shell === 'lean' || build === 'lean' ? 'lean' : 'full';
}

/** Effective profile for a component rendered inside (or outside) an AppShell. */
export function useEffectiveProfile(explicit?: BuildProfile): BuildProfile {
  return resolveProfile(explicit, useContext(ShellProfileContext), BUILD_PROFILE);
}
