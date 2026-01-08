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

import type { NotebookNavigatorSettings } from '../settings';
import { getCachedCommaSeparatedList } from './commaSeparatedListUtils';

export function isCustomPropertyEnabled(settings: NotebookNavigatorSettings): boolean {
    if (settings.customPropertyType === 'wordCount') {
        return true;
    }

    if (settings.customPropertyType === 'frontmatter') {
        return getCachedCommaSeparatedList(settings.customPropertyFrontmatterFields).length > 0;
    }

    return false;
}
