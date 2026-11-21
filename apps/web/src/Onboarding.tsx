import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from './api';
import type { Me } from './config';
import { setLocale } from './i18n';

const LEVELS = ['beginner', 'improver', 'intermediate', 'advanced'] as const;

/** First sign-in form for students (docs/design.md, "Student sign-up"). */
export function Onboarding({ me, onDone }: { me: Me; onDone: (me: Me) => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: me.name,
    phone: '',
    skillLevel: '',
    locale: me.locale,
    emergencyName: '',
    emergencyPhone: '',
    junior: false,
    guardianName: '',
    guardianPhone: '',
    guardianEmail: '',
  });
  const [invalid, setInvalid] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (v: string | boolean) => setForm({ ...form, [k]: v });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFailed(false);
    try {
      const saved = await api<Me>('/me/onboarding', {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          skillLevel: form.skillLevel,
          locale: form.locale,
          emergencyContact: { name: form.emergencyName, phone: form.emergencyPhone },
          junior: form.junior,
          guardian: form.junior
            ? { name: form.guardianName, phone: form.guardianPhone, email: form.guardianEmail }
            : null,
        }),
      });
      await setLocale(saved.locale);
      onDone(saved);
    } catch (err) {
      if (err instanceof ApiError && err.body.fields) setInvalid(err.body.fields);
      else setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const field = (
    path: string,
    key: keyof typeof form,
    label: string,
    type: 'text' | 'tel' | 'email' = 'text',
  ) => (
    <label className="rc-field">
      <span>{label}</span>
      <input
        type={type}
        value={String(form[key])}
        aria-invalid={invalid.includes(path)}
        onChange={(e) => set(key)(e.target.value)}
      />
      {invalid.includes(path) && <span className="rc-error">{t('onboarding.fieldError')}</span>}
    </label>
  );

  return (
    <form className="rc-card" onSubmit={submit} noValidate data-testid="onboarding">
      <h2>{t('onboarding.title')}</h2>
      {field('name', 'name', t('onboarding.name'))}
      {field('phone', 'phone', t('onboarding.phone'), 'tel')}
      <label className="rc-field">
        <span>{t('onboarding.skillLevel')}</span>
        <select
          value={form.skillLevel}
          aria-invalid={invalid.includes('skillLevel')}
          onChange={(e) => set('skillLevel')(e.target.value)}
        >
          <option value="" disabled>
            {t('onboarding.choose')}
          </option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {t(`onboarding.level.${l}`)}
            </option>
          ))}
        </select>
        {invalid.includes('skillLevel') && (
          <span className="rc-error">{t('onboarding.fieldError')}</span>
        )}
      </label>
      <label className="rc-field">
        <span>{t('onboarding.language')}</span>
        <select value={form.locale} onChange={(e) => set('locale')(e.target.value)}>
          <option value="en">English</option>
          <option value="vi">Tiếng Việt</option>
        </select>
      </label>

      <fieldset className="rc-fieldset">
        <legend>{t('onboarding.emergencyTitle')}</legend>
        {field('emergencyContact.name', 'emergencyName', t('onboarding.contactName'))}
        {field('emergencyContact.phone', 'emergencyPhone', t('onboarding.contactPhone'), 'tel')}
      </fieldset>

      <label className="rc-check">
        <input
          type="checkbox"
          checked={form.junior}
          onChange={(e) => set('junior')(e.target.checked)}
        />
        <span>{t('onboarding.junior')}</span>
      </label>
      {form.junior && (
        <fieldset className="rc-fieldset">
          <legend>{t('onboarding.guardianTitle')}</legend>
          {field('guardian.name', 'guardianName', t('onboarding.contactName'))}
          {field('guardian.phone', 'guardianPhone', t('onboarding.contactPhone'), 'tel')}
          {field('guardian.email', 'guardianEmail', t('onboarding.guardianEmail'), 'email')}
        </fieldset>
      )}

      {failed && <p className="rc-error">{t('onboarding.failed')}</p>}
      <button type="submit" className="rc-button" disabled={saving}>
        {saving ? t('onboarding.saving') : t('onboarding.save')}
      </button>
    </form>
  );
}
