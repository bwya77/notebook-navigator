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

import { promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const projectRoot = path.resolve(dirname, '..');
const srcDir = path.join(projectRoot, 'src');
const localesDir = path.join(srcDir, 'i18n', 'locales');
const enLocalePath = path.join(localesDir, 'en.ts');

// Normalizes CRLF/CR newlines to LF for consistent parsing.
function normalizeNewlines(input) {
    return input.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

// Removes any trailing `// ...` comment from a line, ignoring comment markers inside quotes.
function stripInlineComment(line) {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;
    let escaped = false;

    for (let index = 0; index < line.length; index++) {
        const character = line[index];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (character === '\\') {
            escaped = true;
            continue;
        }

        if (inSingleQuote) {
            if (character === "'") {
                inSingleQuote = false;
            }
            continue;
        }

        if (inDoubleQuote) {
            if (character === '"') {
                inDoubleQuote = false;
            }
            continue;
        }

        if (inTemplate) {
            if (character === '`') {
                inTemplate = false;
            }
            continue;
        }

        if (character === "'") {
            inSingleQuote = true;
            continue;
        }

        if (character === '"') {
            inDoubleQuote = true;
            continue;
        }

        if (character === '`') {
            inTemplate = true;
            continue;
        }

        if (character === '/' && line[index + 1] === '/') {
            return line.slice(0, index);
        }
    }

    return line;
}

// Extracts dot-delimited leaf key paths from a STRINGS_* export, based on the object literal structure.
function extractLeafKeyPaths(localeSource) {
    const keys = [];
    const lines = normalizeNewlines(localeSource).split('\n');
    const currentPath = [];
    let inExport = false;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!inExport) {
            if (trimmedLine.startsWith('export const STRINGS_')) {
                inExport = true;
            }
            continue;
        }

        const code = stripInlineComment(line).trim();
        if (!code) {
            continue;
        }

        const objectStartMatch = code.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\{\s*$/);
        if (objectStartMatch) {
            currentPath.push(objectStartMatch[1]);
            continue;
        }

        if (/^\}\s*,?\s*;?\s*$/.test(code)) {
            if (currentPath.length > 0) {
                currentPath.pop();
            }
            continue;
        }

        const leafMatch = code.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*/);
        if (leafMatch) {
            keys.push([...currentPath, leafMatch[1]].join('.'));
        }
    }

    return keys;
}

// Collects `.ts` / `.tsx` files under `rootDir`, excluding any directories listed in `excludedDirs`.
async function collectSourceFiles(rootDir, excludedDirs) {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            const shouldExclude = excludedDirs.some(
                excludedDir => fullPath === excludedDir || fullPath.startsWith(`${excludedDir}${path.sep}`)
            );
            if (shouldExclude) {
                continue;
            }

            files.push(...(await collectSourceFiles(fullPath, excludedDirs)));
            continue;
        }

        if (!entry.isFile()) {
            continue;
        }

        if (entry.name.endsWith('.d.ts')) {
            continue;
        }

        if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            files.push(fullPath);
        }
    }

    return files;
}

// Builds a regex for matching non-`strings.` access like `settings.items.foo` from destructured/aliased objects.
function buildTopLevelKeyRegex(topLevelKeys) {
    const escapedKeys = topLevelKeys
        .slice()
        .sort((a, b) => b.length - a.length)
        .map(key => key.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (escapedKeys.length === 0) {
        return null;
    }

    return new RegExp(`\\b(${escapedKeys.join('|')})\\.([a-zA-Z_][a-zA-Z0-9_]*(?:\\.[a-zA-Z_][a-zA-Z0-9_]*)*)`, 'g');
}

// Resolves `a.b.c.d` to the nearest existing key in the locale map (e.g. `a.b.c`) when deeper access is detected.
function resolveExistingKeyPath(candidatePath, allKeys) {
    let resolved = candidatePath;
    while (resolved) {
        if (allKeys.has(resolved)) {
            return resolved;
        }

        const lastDotIndex = resolved.lastIndexOf('.');
        if (lastDotIndex === -1) {
            return null;
        }

        resolved = resolved.slice(0, lastDotIndex);
    }

    return null;
}

// Finds used leaf keys in a source file by scanning for `strings.<path>` and common destructured access patterns.
function findUsedKeys(sourceText, allKeys, topLevelKeyRegex) {
    const used = new Set();

    const stringsAccessRegex = /\bstrings\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g;
    let match = stringsAccessRegex.exec(sourceText);
    while (match) {
        const resolvedPath = resolveExistingKeyPath(match[1], allKeys);
        if (resolvedPath) {
            used.add(resolvedPath);
        }
        match = stringsAccessRegex.exec(sourceText);
    }

    if (topLevelKeyRegex) {
        match = topLevelKeyRegex.exec(sourceText);
        while (match) {
            const resolvedPath = resolveExistingKeyPath(`${match[1]}.${match[2]}`, allKeys);
            if (resolvedPath) {
                used.add(resolvedPath);
            }
            match = topLevelKeyRegex.exec(sourceText);
        }
    }

    return used;
}

// Prompts for a yes/no confirmation on stdin.
async function promptYesNo(question) {
    const reader = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await reader.question(question);
        return /^y(es)?$/i.test(answer.trim());
    } finally {
        reader.close();
    }
}

// Groups dot-delimited key paths by their top-level prefix (e.g. `settings.*`).
function groupByTopLevelKey(keyPaths) {
    const groups = new Map();
    for (const keyPath of keyPaths) {
        const [topLevel] = keyPath.split('.');
        const group = groups.get(topLevel) ?? [];
        group.push(keyPath);
        groups.set(topLevel, group);
    }

    for (const [, keys] of groups) {
        keys.sort((a, b) => a.localeCompare(b));
    }

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

// Prints CLI usage and option descriptions.
function printUsage() {
    console.log('Usage: node scripts/check-unused-strings.mjs [--fix] [--yes] [--fail]');
    console.log('');
    console.log('Options:');
    console.log('  --fix   Remove unused keys from locale files (safe line removal)');
    console.log('  --yes   Skip confirmation prompt (requires --fix)');
    console.log('  --fail  Exit with status 1 if unused keys are found');
}

// Parses CLI flags and validates option combinations.
function parseArgs(argv) {
    const options = {
        fix: false,
        yes: false,
        fail: false,
        help: false
    };

    for (const arg of argv) {
        if (arg === '--fix') {
            options.fix = true;
            continue;
        }

        if (arg === '--yes' || arg === '-y') {
            options.yes = true;
            continue;
        }

        if (arg === '--fail') {
            options.fail = true;
            continue;
        }

        if (arg === '--help' || arg === '-h') {
            options.help = true;
            continue;
        }

        throw new Error(`Unknown option: ${arg}`);
    }

    if (options.yes && !options.fix) {
        throw new Error('--yes requires --fix');
    }

    return options;
}

// Removes unused keys from a locale file by deleting single-line `key: value,` entries (keeps formatting and comments).
function removeKeysFromLocaleSource(localeSource, keysToRemove) {
    const lines = normalizeNewlines(localeSource).split('\n');
    const currentPath = [];
    const output = [];
    const removedKeys = new Set();
    let inExport = false;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!inExport) {
            output.push(line);
            if (trimmedLine.startsWith('export const STRINGS_')) {
                inExport = true;
            }
            continue;
        }

        const code = stripInlineComment(line).trim();

        const objectStartMatch = code.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\{\s*$/);
        if (objectStartMatch) {
            currentPath.push(objectStartMatch[1]);
            output.push(line);
            continue;
        }

        if (/^\}\s*,?\s*;?\s*$/.test(code)) {
            if (currentPath.length > 0) {
                currentPath.pop();
            }
            output.push(line);
            continue;
        }

        const leafMatch = code.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*/);
        if (leafMatch) {
            const keyPath = [...currentPath, leafMatch[1]].join('.');
            if (keysToRemove.has(keyPath) && code.endsWith(',')) {
                removedKeys.add(keyPath);
                continue;
            }
        }

        output.push(line);
    }

    return { updatedSource: output.join('\n'), removedKeys };
}

const options = (() => {
    try {
        return parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        console.log('');
        printUsage();
        process.exit(1);
    }
})();

if (options.help) {
    printUsage();
    process.exit(0);
}

try {
    await fs.access(enLocalePath);
} catch {
    console.error(`Error: Missing locale file at ${path.relative(projectRoot, enLocalePath)}`);
    process.exit(1);
}

const enSource = await fs.readFile(enLocalePath, 'utf8');
const allKeyPaths = Array.from(new Set(extractLeafKeyPaths(enSource))).sort((a, b) => a.localeCompare(b));
const allKeys = new Set(allKeyPaths);
const topLevelKeys = Array.from(new Set(allKeyPaths.map(keyPath => keyPath.split('.')[0])));

const excludedDirs = [localesDir];
const sourceFiles = await collectSourceFiles(srcDir, excludedDirs);

const topLevelKeyRegex = buildTopLevelKeyRegex(topLevelKeys);
const usedKeys = new Set();

for (const filePath of sourceFiles) {
    const sourceText = await fs.readFile(filePath, 'utf8');
    for (const key of findUsedKeys(sourceText, allKeys, topLevelKeyRegex)) {
        usedKeys.add(key);
    }
}

const unusedKeys = allKeyPaths.filter(key => !usedKeys.has(key));

console.log('Language string usage check');
console.log('');
console.log(`Locale source: ${path.relative(projectRoot, enLocalePath)}`);
console.log(`Search scope: ${path.relative(projectRoot, srcDir)} (excluding ${path.relative(projectRoot, localesDir)})`);
console.log('');
console.log(`String keys: ${allKeyPaths.length}`);
console.log(`Used: ${usedKeys.size}`);
console.log(`Unused: ${unusedKeys.length}`);

if (unusedKeys.length > 0) {
    console.log('');
    console.log('Unused keys:');
    for (const [section, keys] of groupByTopLevelKey(unusedKeys)) {
        console.log('');
        console.log(`${section}:`);
        for (const keyPath of keys) {
            console.log(`  - ${keyPath}`);
        }
    }
} else {
    console.log('');
    console.log('All keys are being used.');
}

if (unusedKeys.length > 0 && options.fix) {
    console.log('');
    const shouldRemove = options.yes ? true : await promptYesNo(`Remove ${unusedKeys.length} unused keys from locale files? [y/N] `);

    if (shouldRemove) {
        const keysToRemove = new Set(unusedKeys);
        const localeEntries = await fs.readdir(localesDir, { withFileTypes: true });
        const localeFiles = localeEntries
            .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
            .map(entry => path.join(localesDir, entry.name))
            .sort((a, b) => a.localeCompare(b));

        let totalRemoved = 0;
        let updatedFiles = 0;

        for (const localeFile of localeFiles) {
            const localeSource = await fs.readFile(localeFile, 'utf8');
            const { updatedSource, removedKeys } = removeKeysFromLocaleSource(localeSource, keysToRemove);
            if (removedKeys.size === 0) {
                continue;
            }

            await fs.writeFile(localeFile, updatedSource, 'utf8');
            updatedFiles++;
            totalRemoved += removedKeys.size;
        }

        console.log('');
        console.log(`Updated locale files: ${updatedFiles}/${localeFiles.length}`);
        console.log(`Removed keys: ${totalRemoved}`);
        console.log('Note: Only removes single-line entries with a trailing comma (inline comments are supported).');
    } else {
        console.log('No changes made.');
    }
}

if (options.fail && unusedKeys.length > 0) {
    process.exitCode = 1;
}
