import { MAX_EVENT_GENERATION_DAYS } from "@/convex/constants/events";
import { EventSeries } from "@/convex/service/events/schemas";
import { addDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Generates upcoming event dates based on series recurrence pattern
 * @param series Event series containing schedule and location information
 * @param startDate Start date timestamp for generation
 * @param endDate End date timestamp for generation
 * @returns Array of event date timestamps
 */
export const generateUpcomingEventDates = (
  series: EventSeries,
  startDate: number,
  endDate: number,
): number[] => {
  const dates: number[] = [];
  const { schedule, location } = series;
  const { daysOfWeek, interval } = schedule;

  const startDateInTz = toZonedTime(startDate, location.timezone);
  const endDateInTz = toZonedTime(endDate, location.timezone);
  const maxGenerationDate = addDays(startDateInTz, MAX_EVENT_GENERATION_DAYS);
  const maxEndDate = maxGenerationDate < endDateInTz ? maxGenerationDate : endDateInTz;

  const currentDate = new Date(startDateInTz);
  let weekCount = 0;

  while (currentDate < maxEndDate) {
    const dayOfWeek = currentDate.getDay();

    if (daysOfWeek.includes(dayOfWeek)) {
      const eventDateUtc = fromZonedTime(currentDate, location.timezone);
      dates.push(eventDateUtc.getTime());
    }

    currentDate.setDate(currentDate.getDate() + 1);

    if (currentDate.getDay() === 0) {
      weekCount++;
      if (weekCount % interval !== 0) {
        currentDate.setDate(currentDate.getDate() + 7 * (interval - 1));
      }
    }
  }

  return dates;
};
