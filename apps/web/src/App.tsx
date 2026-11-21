import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { currentIdToken, signOut, startSignIn } from './auth/cognito';
import type { AppConfig, Me } from './config';
import { GoogleSetup } from './GoogleSetup';
import { setLocale } from './i18n';
import { MockSignIn } from './MockSignIn';
import { Onboarding } from './Onboarding';

/**
 * Phase 0 shell: branding, theme layout, language switch, sign-in (mock locally, Cognito in
 * AWS), first-sign-in onboarding and the coach's Google sign-in setup. Booking screens arrive in
 * Phase 1. Every colour comes from --rc-* theme variables.
 */
export function App({ config, signInError }: { config: AppConfig; signInError?: boolean }) {
  const { t, i18n } = useTranslation();
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const lang = (i18n.language === 'vi' ? 'vi' : 'en') as 'en' | 'vi';

  const loadMe = useCallback(async () => {
    try {
      setMe(await api<Me>('/me'));
    } catch {
      setMe(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const signedIn =
      config.auth.mode === 'mock'
        ? Promise.resolve(sessionStorage.getItem('rc.mockUser') !== null)
        : currentIdToken(config).then((token) => token !== null);
    void signedIn.then((yes) => (yes ? loadMe() : setChecking(false)));
  }, [config, loadMe]);

  const leave = () => {
    if (config.auth.mode === 'cognito') return signOut(config);
    sessionStorage.removeItem('rc.mockUser');
    setMe(null);
  };

  const signedOut = !checking && !me;

  return (
    <div
      className={`rc-app rc-nav-${config.theme.layout.nav} rc-density-${config.theme.layout.density}`}
    >
      <header className="rc-header">
        {config.branding.logoUrl && (
          <img src={config.branding.logoUrl} alt="" className="rc-logo" />
        )}
        <h1 data-testid="app-name">{config.branding.appName}</h1>
        <select
          aria-label={t('settings.language')}
          value={lang}
          onChange={(e) => void setLocale(e.target.value as 'en' | 'vi')}
        >
          <option value="en">English</option>
          <option value="vi">Tiếng Việt</option>
        </select>
      </header>

      <main className="rc-main">
        <p className="rc-tagline">{t('app.tagline')}</p>
        {signInError && <p className="rc-error">{t('auth.signInFailed')}</p>}

        {signedOut && config.auth.mode === 'mock' && <MockSignIn onSignIn={() => void loadMe()} />}
        {signedOut && config.auth.mode === 'cognito' && (
          <section className="rc-card rc-stack">
            {config.auth.google && (
              <button
                type="button"
                className="rc-button"
                onClick={() => void startSignIn(config, 'Google')}
              >
                {t('auth.continueWithGoogle')}
              </button>
            )}
            <button
              type="button"
              className={config.auth.google ? 'rc-button rc-button-secondary' : 'rc-button'}
              onClick={() => void startSignIn(config)}
            >
              {t('auth.signInWithEmail')}
            </button>
          </section>
        )}

        {me?.needsOnboarding && <Onboarding me={me} onDone={setMe} />}

        {me && !me.needsOnboarding && (
          <>
            <section className="rc-card">
              <h2>{t('home.welcome', { name: me.name })}</h2>
              <p>
                {me.email} ({me.roles.join(', ')})
              </p>
              <button type="button" className="rc-button rc-button-secondary" onClick={leave}>
                {t('auth.signOut')}
              </button>
            </section>
            {me.roles.includes('owner') && <GoogleSetup />}
          </>
        )}

        <section className="rc-card">
          <h2>{t('plugins.title')}</h2>
          <ul>
            {config.plugins.map((p) => (
              <li key={p.id}>{p.name[lang]}</li>
            ))}
          </ul>
        </section>
      </main>

      <nav className="rc-nav" aria-label={t('nav.main')}>
        <a href="/">{t('nav.home')}</a>
        <a href="/sessions">{t('nav.sessions')}</a>
        <a href="/inbox">{t('nav.inbox')}</a>
        <a href="/profile">{t('nav.profile')}</a>
      </nav>
    </div>
  );
}
