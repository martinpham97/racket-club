import { useTranslation } from 'react-i18next';

export interface MockUser {
  id: string;
  email: string;
  roles: Array<'owner' | 'staff' | 'student'>;
}

const PEOPLE: MockUser[] = [
  { id: 'coach', email: 'coach@example.com', roles: ['owner'] },
  { id: 'staff-1', email: 'assistant@example.com', roles: ['staff'] },
  { id: 'student-1', email: 'linh@example.com', roles: ['student'] },
  { id: 'student-2', email: 'sam@example.com', roles: ['student'] },
];

/** Local development only: pick who you are, no Google credentials needed. */
export function MockSignIn({ onSignIn }: { onSignIn: (u: MockUser) => void }) {
  const { t } = useTranslation();
  return (
    <section className="rc-card" data-testid="mock-sign-in">
      <h2>{t('auth.mockTitle')}</h2>
      {PEOPLE.map((p) => (
        <button
          key={p.id}
          type="button"
          className="rc-button rc-button-secondary"
          onClick={() => {
            // The API reads this header in AUTH_MODE=mock (see apps/api/src/auth.ts).
            sessionStorage.setItem('rc.mockUser', JSON.stringify(p));
            onSignIn(p);
          }}
        >
          {p.email} · {p.roles[0]}
        </button>
      ))}
    </section>
  );
}
