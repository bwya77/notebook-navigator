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
import type { CustomPropertyItem } from '../storage/IndexedDBStorage';
import { getCachedCommaSeparatedList } from './commaSeparatedListUtils';

export type WikiLinkTarget = { target: string; displayText: string };

export function isCustomPropertyEnabled(settings: NotebookNavigatorSettings): boolean {
    if (settings.customPropertyType === 'wordCount') {
        return true;
    }

    if (settings.customPropertyType === 'frontmatter') {
        // Requires at least one configured frontmatter key.
        return getCachedCommaSeparatedList(settings.customPropertyFields).length > 0;
    }

    return false;
}

export function parseStrictWikiLink(value: string): WikiLinkTarget | null {
    // Custom property pills are clickable only when the full value is a single wiki link token.
    const trimmed = value.trim();
    if (!trimmed.startsWith('[[') || !trimmed.endsWith(']]')) {
        return null;
    }

    const inner = trimmed.slice(2, -2).trim();
    if (inner.length === 0 || inner.includes('\n') || inner.includes('\r')) {
        return null;
    }

    const pipeIndex = inner.indexOf('|');
    const rawTarget = (pipeIndex === -1 ? inner : inner.slice(0, pipeIndex)).trim();
    if (rawTarget.length === 0) {
        return null;
    }

    const rawDisplayText = pipeIndex === -1 ? '' : inner.slice(pipeIndex + 1).trim();
    const displayText = rawDisplayText.length > 0 ? rawDisplayText : rawTarget;

    return {
        target: rawTarget,
        displayText: displayText.startsWith('#') ? displayText.slice(1) : displayText
    };
}

export function isSupportedCssColor(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return false;
    }

    const cssApi = globalThis.CSS;
    if (cssApi && typeof cssApi.supports === 'function') {
        // Runtime validation for CSS color strings (handles named colors, hex, hsl(), var(), etc).
        return cssApi.supports('color', trimmed);
    }

    // Fallback for environments without CSS.supports (conservative allowlist).
    const lower = trimmed.toLowerCase();
    return (
        lower.startsWith('#') ||
        lower.startsWith('rgb(') ||
        lower.startsWith('rgba(') ||
        lower.startsWith('hsl(') ||
        lower.startsWith('hsla(') ||
        lower.startsWith('var(')
    );
}

// Clones custom property data so React state can compare and update safely without mutating cache objects.
export function cloneCustomPropertyItems(values: readonly CustomPropertyItem[] | null): CustomPropertyItem[] | null {
    if (!values) {
        return null;
    }
    return values.map(entry => ({ ...entry }));
}

// Compares custom property items by value + optional color, preserving order.
export function areCustomPropertyItemsEqual(
    first: readonly CustomPropertyItem[] | null,
    second: readonly CustomPropertyItem[] | null
): boolean {
    if (first === second) {
        return true;
    }
    if (!first || !second) {
        return false;
    }
    if (first.length !== second.length) {
        return false;
    }
    for (let index = 0; index < first.length; index += 1) {
        const firstItem = first[index];
        const secondItem = second[index];
        if (firstItem.value !== secondItem.value) {
            return false;
        }
        if (firstItem.color !== secondItem.color) {
            return false;
        }
    }
    return true;
}
