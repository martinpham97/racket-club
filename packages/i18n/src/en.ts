// Core English strings. ICU message format: {count, plural, ...}
export default {
  app: {
    tagline: 'Book your badminton classes',
  },
  nav: {
    home: 'Home',
    sessions: 'Sessions',
    bookings: 'My bookings',
    profile: 'Profile',
    inbox: 'Inbox',
    admin: 'Admin',
  },
  auth: {
    continueWithGoogle: 'Continue with Google',
    signOut: 'Sign out',
    mockTitle: 'Local sign-in (development only)',
  },
  sessions: {
    spotsLeft: '{count, plural, =0 {Full} one {# spot left} other {# spots left}}',
    book: 'Book',
    joinWaitlist: 'Join waitlist',
    cancel: 'Cancel booking',
    waitlistPosition: 'You are number {position} on the waitlist',
  },
  payments: {
    unpaid: 'Unpaid',
    partPaid: 'Part paid',
    paid: 'Paid',
    overdue: 'Overdue',
    markPaid: 'Mark as paid',
    payByPayId: 'Pay by PayID to {payId} with reference {reference}',
  },
  notifications: {
    enablePush: 'Turn on reminders',
    iosInstall: 'On iPhone, tap Share, then Add to Home Screen, to get reminders',
    empty: 'No messages yet',
  },
  settings: {
    language: 'Language',
    appearance: 'Appearance',
    theme: 'Theme',
    appName: 'App name',
    contrastError: 'These colours are hard to read. Choose a darker or lighter colour.',
  },
};
