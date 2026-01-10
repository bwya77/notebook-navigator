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

export interface MomentLocaleData {
    firstDayOfWeek: () => number;
    weekdaysMin: () => string[];
}

export interface MomentInstance {
    clone: () => MomentInstance;
    format: (format?: string) => string;
    locale: (locale: string) => MomentInstance;
    localeData: () => MomentLocaleData;
    startOf: (unit: string) => MomentInstance;
    endOf: (unit: string) => MomentInstance;
    add: (amount: number, unit: string) => MomentInstance;
    subtract: (amount: number, unit: string) => MomentInstance;
    diff: (other: MomentInstance, unit: string) => number;
    week: () => number;
    month: () => number;
    year: () => number;
    date: () => number;
    isSame: (other: MomentInstance, unit?: string) => boolean;
    set: (values: Record<string, number>) => MomentInstance;
    get: (unit: string) => number;
    toDate: () => Date;
}

export interface MomentApi {
    (input?: unknown, format?: string, strict?: boolean): MomentInstance;
    locales: () => string[];
    locale: () => string;
    fn: Record<string, unknown>;
    utc: (...args: unknown[]) => unknown;
}

let cachedMomentApi: MomentApi | null | undefined;

function isMomentApi(value: unknown): value is MomentApi {
    if (typeof value !== 'function') {
        return false;
    }
    if (!('fn' in value) || typeof (value as { fn?: unknown }).fn !== 'object' || (value as { fn?: unknown }).fn === null) {
        return false;
    }
    if (!('utc' in value) || typeof (value as { utc?: unknown }).utc !== 'function') {
        return false;
    }
    return true;
}

export function getMomentApi(): MomentApi | null {
    // Obsidian injects `window.moment` for plugin use; cache the first observed *valid* value to avoid repeated lookups.
    if (cachedMomentApi !== undefined) {
        return cachedMomentApi;
    }

    // Tests run in Node where `window` doesn't exist.
    if (typeof window === 'undefined') {
        cachedMomentApi = null;
        return null;
    }

    const momentValue = (window as { moment?: unknown }).moment;
    if (!isMomentApi(momentValue)) {
        return null;
    }

    cachedMomentApi = momentValue;
    return cachedMomentApi;
}
