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

import type { Locale } from 'date-fns';
import * as locales from 'date-fns/locale';

type LocalesMap = typeof locales & Record<string, Locale>;

function normalizeLanguageCode(language: string): string {
    // Accept Obsidian/moment style ids (may include `_`) and normalize to lowercase `xx` / `xx-yy`.
    return (language || 'en').replace(/_/g, '-').toLowerCase();
}

const LOCALE_EXCEPTIONS: Record<string, string> = {
    // date-fns locale module names don't always match BCP-47 language tags.
    // Keep this list focused to the cases where the export key differs from the normalized tag.
    en: 'enUS',
    'en-us': 'enUS',
    'en-gb': 'enGB',
    zh: 'zhCN',
    'zh-cn': 'zhCN',
    'zh-tw': 'zhTW',
    pt: 'pt',
    'pt-br': 'ptBR',
    no: 'nb'
};

export function getDateFnsLocale(language: string): Locale {
    // Calendar and date formatting use date-fns Locale objects; fall back to enUS if the locale isn't available.
    const normalized = normalizeLanguageCode(language);
    const localeName = LOCALE_EXCEPTIONS[normalized] || normalized;
    const localesMap = locales as LocalesMap;
    return localesMap[localeName] || locales.enUS;
}
