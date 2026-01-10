import { describe, expect, test } from 'vitest';
import { getWeek } from 'date-fns';
import { getCalendarWeekConfig } from '../../src/utils/calendarWeekConfig';

describe('getCalendarWeekConfig', () => {
    test('en-US: week starts on Sunday and week 1 contains Jan 1', () => {
        const config = getCalendarWeekConfig('en-us');
        expect(config.weekStartsOn).toBe(0);
        expect(config.firstWeekContainsDate).toBe(1);

        const date = new Date(2023, 0, 1, 12);
        expect(getWeek(date, config)).toBe(1);
    });

    test('sv: week starts on Monday and ISO week numbering', () => {
        const config = getCalendarWeekConfig('sv');
        expect(config.weekStartsOn).toBe(1);
        expect(config.firstWeekContainsDate).toBe(4);

        const date = new Date(2023, 0, 1, 12);
        expect(getWeek(date, config)).toBe(52);
    });
});
