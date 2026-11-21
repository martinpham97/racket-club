import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from './api';

interface Status {
  configured: boolean;
  clientId: string | null;
  redirectUrl: string | null;
}

/** Setup wizard step "Google sign-in" (docs/design.md, "In-app setup wizard"). Owner only. */
export function GoogleSetup() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status | 'unavailable' | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Status>('/admin/setup/google')
      .then(setStatus)
      .catch(() => setStatus('unavailable'));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!status || status === 'unavailable') return;
    setSaving(true);
    setInvalid([]);
    setFailure(null);
    try {
      const done = await api<{ clientId: string }>('/admin/setup/google', {
        method: 'PUT',
        body: JSON.stringify({ clientId, clientSecret }),
      });
      setStatus({ ...status, configured: true, clientId: done.clientId });
      setClientSecret('');
    } catch (err) {
      if (err instanceof ApiError && err.body.fields) setInvalid(err.body.fields);
      else setFailure(err instanceof ApiError ? (err.body.message ?? err.message) : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rc-card" data-testid="google-setup">
      <h2>{t('setup.google.title')}</h2>
      {status === 'unavailable' && <p>{t('setup.google.unavailable')}</p>}
      {status && status !== 'unavailable' && (
        <>
          {status.configured && <p className="rc-success">{t('setup.google.done')}</p>}
          <p>{t('setup.google.intro')}</p>
          {status.redirectUrl && (
            <label className="rc-field">
              <span>{t('setup.google.redirectUrl')}</span>
              <input readOnly value={status.redirectUrl} onFocus={(e) => e.target.select()} />
            </label>
          )}
          <form onSubmit={submit} noValidate className="rc-stack">
            <label className="rc-field">
              <span>{t('setup.google.clientId')}</span>
              <input
                value={clientId}
                placeholder={status.clientId ?? ''}
                aria-invalid={invalid.includes('clientId')}
                onChange={(e) => setClientId(e.target.value)}
              />
              {invalid.includes('clientId') && (
                <span className="rc-error">{t('setup.google.fieldError')}</span>
              )}
            </label>
            <label className="rc-field">
              <span>{t('setup.google.clientSecret')}</span>
              <input
                type="password"
                autoComplete="off"
                value={clientSecret}
                aria-invalid={invalid.includes('clientSecret')}
                onChange={(e) => setClientSecret(e.target.value)}
              />
              {invalid.includes('clientSecret') && (
                <span className="rc-error">{t('setup.google.fieldError')}</span>
              )}
            </label>
            {failure && (
              <p className="rc-error">{t('setup.google.failed', { message: failure })}</p>
            )}
            <button type="submit" className="rc-button" disabled={saving}>
              {saving ? t('setup.google.saving') : t('setup.google.save')}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
