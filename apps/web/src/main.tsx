import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadConfig } from './config';
import { initI18n } from './i18n';
import './styles.css';

async function start() {
  const root = createRoot(document.getElementById('root') as HTMLElement);
  try {
    const config = await loadConfig();
    await initI18n(config.branding.defaultLocale);
    document.title = config.branding.appName;
    root.render(
      <StrictMode>
        <App config={config} />
      </StrictMode>,
    );
  } catch (err) {
    root.render(<p role="alert">{(err as Error).message}</p>);
  }
}

void start();
