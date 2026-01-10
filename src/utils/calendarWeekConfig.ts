/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { Day, FirstWeekContainsDate } from 'date-fns';
import { getDateFnsLocale } from './dateFnsLocale';

export interface CalendarWeekConfig {
    weekStartsOn: Day;
    firstWeekContainsDate: FirstWeekContainsDate;
}

function toDay(value: unknown, fallback: Day): Day {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6 ? (value as Day) : fallback;
}

function toFirstWeekContainsDate(value: unknown, fallback: FirstWeekContainsDate): FirstWeekContainsDate {
    return value === 1 || value === 4 ? value : fallback;
}

export function getCalendarWeekConfig(language: string): CalendarWeekConfig {
    const locale = getDateFnsLocale(language);
    const options = locale.options ?? {};

    return {
        weekStartsOn: toDay(options.weekStartsOn, 1),
        firstWeekContainsDate: toFirstWeekContainsDate(options.firstWeekContainsDate, 4)
    };
}
