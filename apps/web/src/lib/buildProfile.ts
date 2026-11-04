declare const __GHOSTPAY_PROFILE__: 'full' | 'lean' | undefined;

export type BuildProfile = 'full' | 'lean';

/**
 * Local build profile, injected at compile time by vite.config.ts (`define`) from GHOSTPAY_LOCAL_BUILD_PROFILE.
 * Defaults to 'full' when the constant is absent.
 */
export const BUILD_PROFILE: BuildProfile = typeof __GHOSTPAY_PROFILE__ === 'undefined' ? 'full' : __GHOSTPAY_PROFILE__;
