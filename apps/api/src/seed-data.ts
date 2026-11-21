/**
 * Demo data for `pnpm seed` in the local AWS Emulator. A coach, an assistant, 20 students, a
 * 10-week term of three weekly classes, bookings for the first weeks and unpaid term invoices.
 * The ids match the mock sign-in people (coach, staff-1, student-1, student-2).
 *
 */
import { randomUUID } from 'node:crypto';
import { addDays, type Clock, fromLocal, toLocal } from '@racket-club/core';
import { bookSeat } from './data/bookings';
import type { DataService } from './data/entities';

const TIMEZONE = 'Australia/Sydney';
const CURRENCY = 'AUD';
const WEEKS = 10;

const STAFF = [
  { userId: 'coach', name: 'Coach Minh', email: 'coach@example.com', role: 'owner' },
  { userId: 'staff-1', name: 'Alex Assistant', email: 'assistant@example.com', role: 'staff' },
] as const;

const STUDENT_NAMES = [
  ['student-1', 'Linh Nguyen', 'linh@example.com', 'vi'],
  ['student-2', 'Sam Taylor', 'sam@example.com', 'en'],
  ...[
    'An Tran',
    'Bao Pham',
    'Chloe Smith',
    'Daniel Lee',
    'Emma Wilson',
    'Hoa Le',
    'Isaac Brown',
    'Jack Chen',
    'Khanh Vo',
    'Lily Martin',
    'Mai Hoang',
    'Noah Williams',
    'Olivia Jones',
    'Phuong Do',
    'Quan Bui',
    'Ruby Clarke',
    'Thanh Dang',
    'Zoe Walker',
  ].map((name, i) => {
    const vi = /^(An|Bao|Hoa|Khanh|Mai|Phuong|Quan|Thanh) /.test(name);
    return [
      `student-${i + 3}`,
      name,
      `${name.split(' ')[0]?.toLowerCase()}@example.com`,
      vi ? 'vi' : 'en',
    ];
  }),
] as Array<[string, string, string, 'en' | 'vi']>;

/** Weekly classes; `weekday` 1 = Monday. Times are wall-clock in the coach's timezone. */
const CLASSES = [
  {
    classId: 'beginners',
    name: 'Beginners',
    level: 'Beginner',
    weekday: 1,
    hour: 18,
    minute: 0,
    durationMinutes: 90,
    capacity: 12,
    priceCents: 2500,
  },
  {
    classId: 'intermediate',
    name: 'Intermediate squad',
    level: 'Intermediate',
    weekday: 3,
    hour: 19,
    minute: 0,
    durationMinutes: 90,
    capacity: 10,
    priceCents: 3000,
  },
  {
    classId: 'weekend-drills',
    name: 'Weekend drills',
    level: 'All levels',
    weekday: 6,
    hour: 9,
    minute: 0,
    durationMinutes: 120,
    capacity: 16,
    priceCents: 3500,
  },
];

/** Deterministic "random" picks, so every seed looks the same apart from the dates. */
function picker(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

/** Does nothing (and says so) if the tenant already has its coach. */
export async function seedDemoData(data: DataService, clock: Clock, tenantId = 'default') {
  const now = clock.now().toISOString();
  if ((await data.entities.user.get({ tenantId, userId: 'coach' }).go()).data) {
    return { seeded: false as const };
  }

  for (const s of STAFF) {
    await data.entities.user
      .create({
        tenantId,
        ...s,
        roles: [s.role],
        primaryRole: s.role,
        locale: 'en',
        createdAt: now,
      })
      .go();
  }
  for (const [userId, name, email, locale] of STUDENT_NAMES) {
    await data.entities.user
      .create({
        tenantId,
        userId,
        name,
        email,
        roles: ['student'],
        primaryRole: 'student',
        locale,
        createdAt: now,
      })
      .go();
  }

  // The term starts on the Monday after today, in the coach's timezone.
  const today = toLocal(clock.now(), TIMEZONE);
  const termStart = addDays(today, (8 - today.weekday) % 7 || 7);
  const sessions: Array<{ classId: string; startsAt: string; capacity: number; week: number }> = [];
  for (const c of CLASSES) {
    await data.entities.class
      .create({
        tenantId,
        classId: c.classId,
        coachId: 'coach',
        name: c.name,
        level: c.level,
        venue: 'Sports Hall, Court 1-3',
        capacity: c.capacity,
        priceCents: c.priceCents,
        currency: CURRENCY,
        durationMinutes: c.durationMinutes,
      })
      .go();
    for (let week = 0; week < WEEKS; week++) {
      const date = addDays(termStart, week * 7 + (c.weekday - 1));
      const start = fromLocal({ ...date, hour: c.hour, minute: c.minute }, TIMEZONE);
      const startsAt = start.toISOString();
      const endsAt = new Date(start.getTime() + c.durationMinutes * 60_000).toISOString();
      await data.entities.session
        .create({
          tenantId,
          classId: c.classId,
          startsAt,
          endsAt,
          coachId: 'coach',
          venue: 'Sports Hall',
          capacity: c.capacity,
        })
        .go();
      sessions.push({ classId: c.classId, startsAt, capacity: c.capacity, week });
    }
  }

  // Bookings for the first three weeks: each session 60-100% full, through the real transaction.
  const random = picker(42);
  const studentIds = STUDENT_NAMES.map(([id]) => id);
  let bookings = 0;
  const booked = new Map<string, number>();
  for (const s of sessions.filter((x) => x.week < 3)) {
    const want = Math.round(s.capacity * (0.6 + random() * 0.4));
    const shuffled = [...studentIds].sort(() => random() - 0.5).slice(0, want);
    for (const userId of shuffled) {
      const result = await bookSeat(data, {
        tenantId,
        classId: s.classId,
        startsAt: s.startsAt,
        userId,
        bookingId: randomUUID(),
        createdAt: now,
      });
      if (result.kind === 'booked') {
        bookings++;
        booked.set(userId, (booked.get(userId) ?? 0) + 1);
      }
    }
  }

  // An unpaid term invoice for eight students, due two weeks into the term.
  const dueAt = fromLocal(
    { ...addDays(termStart, 14), hour: 23, minute: 59 },
    TIMEZONE,
  ).toISOString();
  const invoiced = studentIds.slice(0, 8);
  for (const [i, userId] of invoiced.entries()) {
    const c = CLASSES[i % CLASSES.length] ?? CLASSES[0];
    if (!c) continue;
    await data.entities.invoice
      .create({
        tenantId,
        userId,
        invoiceId: randomUUID(),
        reference: `RC-${1001 + i}`,
        coachId: 'coach',
        currency: CURRENCY,
        lines: [
          {
            description: `${c.name}, ${WEEKS}-week term`,
            amountCents: c.priceCents * WEEKS,
            sourceKind: 'term',
            sourceRef: c.classId,
          },
        ],
        totalCents: c.priceCents * WEEKS,
        dueAt,
        createdAt: now,
      })
      .go();
  }

  return {
    seeded: true as const,
    users: STAFF.length + STUDENT_NAMES.length,
    classes: CLASSES.length,
    sessions: sessions.length,
    bookings,
    invoices: invoiced.length,
    termStarts: `${termStart.year}-${String(termStart.month).padStart(2, '0')}-${String(termStart.day).padStart(2, '0')}`,
  };
}
