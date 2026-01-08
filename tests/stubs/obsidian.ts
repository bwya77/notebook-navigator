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
// Minimal Obsidian API stubs for Vitest environment.

import { deriveFileMetadata } from '../utils/pathMetadata';

export class App {
    vault = {
        getFolderByPath: () => null,
        getAbstractFileByPath: () => null,
        cachedRead: async () => '',
        adapter: {
            readBinary: async () => new ArrayBuffer(0)
        }
    };

    metadataCache = {
        getFileCache: () => null,
        getFirstLinkpathDest: () => null
    };

    fileManager = {
        processFrontMatter: async () => {}
    };
}

export class TFile {
    path = '';
    name = '';
    basename = '';
    extension = '';
    stat = { mtime: 0, ctime: 0 };

    constructor(path = '') {
        this.setPath(path);
    }

    setPath(path: string): void {
        this.path = path;
        const metadata = deriveFileMetadata(path);
        this.name = metadata.name;
        this.basename = metadata.basename;
        this.extension = metadata.extension;
    }
}

export class TFolder {
    path = '';

    constructor(path = '') {
        this.path = path;
    }
}

export class Notice {
    constructor(public message?: string) {}
    hide(): void {}
}

export class Menu {}
export class MenuItem {}
export class Setting {}
export class ButtonComponent {}
export class SliderComponent {}
export class WorkspaceLeaf {}

export const Platform = {
    isDesktopApp: true,
    isMobile: false,
    isIosApp: false
};

export const normalizePath = (value: string) => value;
export const setIcon = () => {};
export const getLanguage = () => 'en';
type RequestUrlResponse = {
    status: number;
    arrayBuffer?: ArrayBuffer;
    headers: Record<string, string>;
};

export const requestUrl = async (): Promise<RequestUrlResponse> => ({
    status: 404,
    headers: {}
});

function stripSurroundingQuotes(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
        return trimmed;
    }

    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function parseInlineArray(value: string): string[] | null {
    const trimmed = value.trim();
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
        return null;
    }

    const inner = trimmed.slice(1, -1).trim();
    if (!inner) {
        return [];
    }

    return inner
        .split(',')
        .map(entry => stripSurroundingQuotes(entry))
        .map(entry => entry.trim())
        .filter(Boolean);
}

/**
 * Minimal YAML parser for Vitest stubs.
 * Supports frontmatter patterns used by the plugin:
 * - `key: value`
 * - `key: [a, b]`
 * - `key:` followed by `- item` list entries
 */
export function parseYaml(yaml: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    let currentListKey: string | null = null;

    const lines = yaml.split(/\r?\n/u);
    for (const rawLine of lines) {
        const trimmedLine = rawLine.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            continue;
        }

        const listMatch = /^\s*-\s*(.*)$/u.exec(rawLine);
        if (listMatch && currentListKey) {
            const item = stripSurroundingQuotes(listMatch[1] ?? '').trim();
            if (!item) {
                continue;
            }
            const existing = result[currentListKey];
            if (Array.isArray(existing)) {
                existing.push(item);
            } else {
                result[currentListKey] = [item];
            }
            continue;
        }

        currentListKey = null;

        const separatorIndex = rawLine.indexOf(':');
        if (separatorIndex <= 0) {
            continue;
        }

        const key = rawLine.slice(0, separatorIndex).trim();
        if (!key) {
            continue;
        }

        let rawValue = rawLine.slice(separatorIndex + 1).trim();
        if (!rawValue) {
            currentListKey = key;
            continue;
        }

        // Remove inline comments (`value # comment`) but keep fragments in URLs (`...#frag`).
        rawValue = rawValue.replace(/\s+#.*$/u, '').trimEnd();

        const inlineArray = parseInlineArray(rawValue);
        if (inlineArray) {
            result[key] = inlineArray;
            continue;
        }

        result[key] = stripSurroundingQuotes(rawValue);
    }

    return result;
}

export type CachedMetadata = {
    frontmatter?: Record<string, unknown>;
    frontmatterPosition?: Pos;
    tags?: TagCache[];
};

export type FrontMatterCache = Record<string, unknown>;
export type Hotkey = { modifiers: string[]; key: string };
export type Modifier = string;

export type TagCache = { tag: string };

/**
 * Minimal `getAllTags` implementation for Vitest.
 * Returns tags with `#` prefix, or `null` when no tags are present.
 */
export function getAllTags(cache: CachedMetadata): string[] | null {
    const tags: string[] = [];
    const seen = new Set<string>();

    if (cache.tags) {
        for (const entry of cache.tags) {
            const raw = typeof entry.tag === 'string' ? entry.tag.trim() : '';
            if (!raw) {
                continue;
            }
            const normalized = raw.startsWith('#') ? raw : `#${raw}`;
            const key = normalized.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            tags.push(normalized);
        }
    }

    const frontmatter = cache.frontmatter;
    const fmTags = frontmatter ? frontmatter['tags'] : undefined;
    if (typeof fmTags === 'string') {
        for (const token of fmTags.split(/[,\s]+/u)) {
            const trimmed = token.trim();
            if (!trimmed) {
                continue;
            }
            const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
            const key = normalized.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            tags.push(normalized);
        }
    } else if (Array.isArray(fmTags)) {
        for (const item of fmTags) {
            if (typeof item !== 'string') {
                continue;
            }
            const trimmed = item.trim();
            if (!trimmed) {
                continue;
            }
            const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
            const key = normalized.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            tags.push(normalized);
        }
    }

    return tags.length > 0 ? tags : null;
}

export type Loc = {
    line: number;
    col: number;
    offset: number;
};

export type Pos = {
    start: Loc;
    end: Loc;
};
