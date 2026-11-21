import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { configureApi } from './api';
import { completeSignIn } from './auth/cognito';
import { loadConfig } from './config';
import { initI18n } from './i18n';
import './styles.css';

async function start() {
  const root = createRoot(document.getElementById('root') as HTMLElement);
  try {
    const config = await loadConfig();
    configureApi(config);
    await initI18n(config.branding.defaultLocale);
    document.title = config.branding.appName;

    // Back from Cognito managed login: trade the code for tokens, then drop it from the URL.
    let signInError = false;
    if (window.location.pathname === '/auth/callback' && config.auth.mode === 'cognito') {
      const result = await completeSignIn(config, new URL(window.location.href));
      signInError = result.kind === 'failed';
      window.history.replaceState(null, '', '/');
    }

    root.render(
      <StrictMode>
        <App config={config} signInError={signInError} />
      </StrictMode>,
    );
  } catch (err) {
    root.render(<p role="alert">{(err as Error).message}</p>);
  }
}

void start();
