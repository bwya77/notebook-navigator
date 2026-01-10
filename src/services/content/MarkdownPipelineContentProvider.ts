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

import { Platform, type CachedMetadata, type FrontMatterCache, type TFile } from 'obsidian';
import { type ContentProviderType } from '../../interfaces/IContentProvider';
import { NotebookNavigatorSettings } from '../../settings';
import { type CustomPropertyItem, FileData } from '../../storage/IndexedDBStorage';
import { getDBInstance } from '../../storage/fileOperations';
import { getCachedCommaSeparatedList } from '../../utils/commaSeparatedListUtils';
import { areCustomPropertyItemsEqual, isCustomPropertyEnabled } from '../../utils/customPropertyUtils';
import { PreviewTextUtils } from '../../utils/previewTextUtils';
import { countWordsForCustomProperty } from '../../utils/wordCountUtils';
import type { ContentProviderProcessResult } from './BaseContentProvider';
import { findFeatureImageReference, type FeatureImageReference } from './featureImageReferenceResolver';
import { FeatureImageContentProvider } from './FeatureImageContentProvider';

type MarkdownPipelineContext = {
    file: TFile;
    fileData: FileData | null;
    settings: NotebookNavigatorSettings;
    content: string;
    frontmatter: FrontMatterCache | null;
    bodyStartIndex: number;
    isExcalidraw: boolean;
    fileModified: boolean;
    customPropertyEnabled: boolean;
    customPropertyNameFields: readonly string[];
    customPropertyColorFields: readonly string[];
    hasContent: boolean;
    featureImageReference: FeatureImageReference | null;
};

type MarkdownPipelineUpdate = {
    preview?: string;
    customProperty?: FileData['customProperty'];
    featureImageKey?: string | null;
    featureImage?: Blob | null;
};

type MarkdownPipelineProcessorId = 'preview' | 'customProperty' | 'featureImage';

type MarkdownPipelineProcessor = {
    id: MarkdownPipelineProcessorId;
    needsProcessing: (context: MarkdownPipelineContext) => boolean;
    run: (context: MarkdownPipelineContext) => Promise<MarkdownPipelineUpdate | null>;
};

function resolveMarkdownBodyStartIndex(metadata: CachedMetadata, content: string): number {
    const rawOffset = metadata.frontmatterPosition?.end?.offset;
    if (typeof rawOffset !== 'number' || rawOffset <= 0) {
        return 0;
    }

    let index = Math.min(Math.max(0, rawOffset), content.length);

    while (index < content.length) {
        const char = content[index];
        if (char !== '\n' && char !== '\r') {
            break;
        }
        index += 1;
    }

    return index;
}

// Converts frontmatter values into a list of pill strings.
// Supports scalars and nested arrays; skips empty strings and non-finite numbers.
function extractFrontmatterValues(value: unknown): string[] {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? [trimmed] : [];
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return [];
        }
        return [value.toString()];
    }

    if (typeof value === 'boolean') {
        return [value ? 'true' : 'false'];
    }

    if (Array.isArray(value)) {
        const parts: string[] = [];
        for (const entry of value) {
            parts.push(...extractFrontmatterValues(entry));
        }
        return parts;
    }

    return [];
}

// Builds the custom property pill list from frontmatter.
// - `nameFields` produce the pill values (all matching fields are included)
// - `colorFields` pair by field index, and list values pair by item index
function resolveCustomPropertyItemsFromFrontmatter(
    frontmatter: FrontMatterCache | null,
    nameFields: readonly string[],
    colorFields: readonly string[]
): CustomPropertyItem[] {
    if (!frontmatter) {
        return [];
    }

    const entries: CustomPropertyItem[] = [];

    for (let fieldIndex = 0; fieldIndex < nameFields.length; fieldIndex += 1) {
        const field = nameFields[fieldIndex];
        const values = extractFrontmatterValues(frontmatter[field]);
        if (values.length === 0) {
            continue;
        }

        const colorField = colorFields.length === 1 ? colorFields[0] : colorFields[fieldIndex];
        const colors = colorField ? extractFrontmatterValues(frontmatter[colorField]) : [];

        for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
            const value = values[valueIndex];
            const color = colors.length === 1 ? colors[0] : colors[valueIndex];
            if (color) {
                entries.push({ value, color });
            } else {
                entries.push({ value });
            }
        }
    }

    return entries;
}

export class MarkdownPipelineContentProvider extends FeatureImageContentProvider {
    protected readonly PARALLEL_LIMIT: number = 10;

    private readonly processors: MarkdownPipelineProcessor[] = [
        {
            id: 'preview',
            needsProcessing: context => {
                return (
                    context.settings.showFilePreview &&
                    (!context.fileData || context.fileModified || context.fileData.previewStatus === 'unprocessed') &&
                    (context.hasContent || context.isExcalidraw)
                );
            },
            run: async context => await this.processPreview(context)
        },
        {
            id: 'customProperty',
            needsProcessing: context => {
                if (!context.customPropertyEnabled) {
                    return false;
                }

                const needsContent = context.settings.customPropertyType === 'wordCount' && !context.isExcalidraw;

                return (
                    (!context.fileData || context.fileModified || context.fileData.customProperty === null) &&
                    (!needsContent || context.hasContent)
                );
            },
            run: async context => await this.processCustomProperty(context)
        },
        {
            id: 'featureImage',
            needsProcessing: context => {
                if (!context.settings.showFeatureImage) {
                    return false;
                }

                if (!context.isExcalidraw && !context.featureImageReference && !context.hasContent) {
                    return false;
                }

                return (
                    !context.fileData ||
                    context.fileModified ||
                    context.fileData.featureImageKey === null ||
                    context.fileData.featureImageStatus === 'unprocessed'
                );
            },
            run: async context => await this.processFeatureImage(context)
        }
    ];

    getContentType(): ContentProviderType {
        return 'markdownPipeline';
    }

    getRelevantSettings(): (keyof NotebookNavigatorSettings)[] {
        return [
            'showFilePreview',
            'skipHeadingsInPreview',
            'skipCodeBlocksInPreview',
            'stripHtmlInPreview',
            'previewProperties',
            'showFeatureImage',
            'featureImageProperties',
            'downloadExternalFeatureImages',
            'customPropertyType',
            'customPropertyFields',
            'customPropertyColorFields'
        ];
    }

    private getClearFlags(context: { oldSettings: NotebookNavigatorSettings; newSettings: NotebookNavigatorSettings } | undefined): {
        shouldClearPreview: boolean;
        shouldClearCustomProperty: boolean;
        shouldClearFeatureImage: boolean;
    } {
        if (!context) {
            return { shouldClearPreview: true, shouldClearCustomProperty: true, shouldClearFeatureImage: true };
        }

        const { oldSettings, newSettings } = context;

        const shouldClearPreview =
            oldSettings.showFilePreview !== newSettings.showFilePreview ||
            oldSettings.skipHeadingsInPreview !== newSettings.skipHeadingsInPreview ||
            oldSettings.skipCodeBlocksInPreview !== newSettings.skipCodeBlocksInPreview ||
            oldSettings.stripHtmlInPreview !== newSettings.stripHtmlInPreview ||
            JSON.stringify(oldSettings.previewProperties) !== JSON.stringify(newSettings.previewProperties);

        const shouldClearCustomProperty =
            oldSettings.customPropertyType !== newSettings.customPropertyType ||
            (newSettings.customPropertyType === 'frontmatter' &&
                (oldSettings.customPropertyFields !== newSettings.customPropertyFields ||
                    oldSettings.customPropertyColorFields !== newSettings.customPropertyColorFields));

        const shouldClearFeatureImage =
            (oldSettings.showFeatureImage && !newSettings.showFeatureImage) ||
            (newSettings.showFeatureImage &&
                (JSON.stringify(oldSettings.featureImageProperties) !== JSON.stringify(newSettings.featureImageProperties) ||
                    oldSettings.downloadExternalFeatureImages !== newSettings.downloadExternalFeatureImages));

        return { shouldClearPreview, shouldClearCustomProperty, shouldClearFeatureImage };
    }

    shouldRegenerate(oldSettings: NotebookNavigatorSettings, newSettings: NotebookNavigatorSettings): boolean {
        const { shouldClearPreview, shouldClearCustomProperty, shouldClearFeatureImage } = this.getClearFlags({
            oldSettings,
            newSettings
        });
        return shouldClearPreview || shouldClearCustomProperty || shouldClearFeatureImage;
    }

    async clearContent(context?: { oldSettings: NotebookNavigatorSettings; newSettings: NotebookNavigatorSettings }): Promise<void> {
        const { shouldClearPreview, shouldClearCustomProperty, shouldClearFeatureImage } = this.getClearFlags(context);

        if (!shouldClearPreview && !shouldClearCustomProperty && !shouldClearFeatureImage) {
            return;
        }

        const db = getDBInstance();

        if (shouldClearPreview) {
            await db.batchClearAllFileContent('preview');
        }

        if (shouldClearCustomProperty) {
            await db.batchClearAllFileContent('customProperty');
        }

        if (shouldClearFeatureImage) {
            await db.batchClearFeatureImageContent('markdown');
        }
    }

    protected needsProcessing(fileData: FileData | null, file: TFile, settings: NotebookNavigatorSettings): boolean {
        if (file.extension !== 'md') {
            return false;
        }

        const customPropertyEnabled = isCustomPropertyEnabled(settings);
        const hasPipelineWork = settings.showFilePreview || settings.showFeatureImage || customPropertyEnabled;
        if (!hasPipelineWork) {
            return false;
        }

        const needsRefresh = fileData !== null && fileData.markdownPipelineMtime !== file.stat.mtime;
        if (!fileData || needsRefresh) {
            return true;
        }

        const needsPreview = settings.showFilePreview && fileData.previewStatus === 'unprocessed';
        const needsFeatureImage =
            settings.showFeatureImage && (fileData.featureImageKey === null || fileData.featureImageStatus === 'unprocessed');
        const needsCustomProperty = customPropertyEnabled && fileData.customProperty === null;

        return needsPreview || needsFeatureImage || needsCustomProperty;
    }

    protected async processFile(
        job: { file: TFile; path: string },
        fileData: FileData | null,
        settings: NotebookNavigatorSettings
    ): Promise<ContentProviderProcessResult> {
        if (job.file.extension !== 'md') {
            return { update: null, processed: true };
        }

        const customPropertyNameFields =
            settings.customPropertyType === 'frontmatter' ? getCachedCommaSeparatedList(settings.customPropertyFields) : [];
        const customPropertyColorFields =
            settings.customPropertyType === 'frontmatter' ? getCachedCommaSeparatedList(settings.customPropertyColorFields) : [];
        const customPropertyEnabled = isCustomPropertyEnabled(settings);
        const hasPipelineWork = settings.showFilePreview || settings.showFeatureImage || customPropertyEnabled;
        if (!hasPipelineWork) {
            return { update: null, processed: true };
        }

        const cachedMetadata = this.app.metadataCache.getFileCache(job.file);
        if (!cachedMetadata) {
            return { update: null, processed: false };
        }

        const frontmatter = cachedMetadata.frontmatter ?? null;
        const isExcalidraw = PreviewTextUtils.isExcalidrawFile(job.file.name, frontmatter ?? undefined);

        const fileModified = fileData !== null && fileData.markdownPipelineMtime !== job.file.stat.mtime;

        const needsPreview =
            settings.showFilePreview && (!fileData || fileModified || fileData.previewStatus === 'unprocessed') && !isExcalidraw;
        const needsCustomProperty =
            customPropertyEnabled &&
            (!fileData || fileModified || fileData.customProperty === null) &&
            settings.customPropertyType === 'wordCount' &&
            !isExcalidraw;
        const needsFeatureImage =
            settings.showFeatureImage &&
            (!fileData || fileModified || fileData.featureImageKey === null || fileData.featureImageStatus === 'unprocessed') &&
            !isExcalidraw;

        const frontmatterFeatureImageReference =
            needsFeatureImage && frontmatter
                ? findFeatureImageReference({
                      app: this.app,
                      file: job.file,
                      content: '',
                      settings,
                      frontmatter,
                      bodyStartIndex: 0
                  })
                : null;

        const needsContent = needsPreview || needsCustomProperty || (needsFeatureImage && !frontmatterFeatureImageReference);

        const update: {
            path: string;
            preview?: string;
            featureImage?: Blob | null;
            featureImageKey?: string | null;
            customProperty?: FileData['customProperty'];
        } = { path: job.path };

        if (needsContent) {
            const maxMarkdownReadBytes = Platform.isMobile ? 2_000_000 : 8_000_000;
            if (job.file.stat.size > maxMarkdownReadBytes) {
                // Avoid reading full markdown content for large files; only apply updates derived from cached metadata/frontmatter.
                let hasSafeUpdate = false;

                if (settings.showFilePreview && (!fileData || fileData.previewStatus === 'unprocessed')) {
                    update.preview = '';
                    hasSafeUpdate = true;
                }

                if (customPropertyEnabled && settings.customPropertyType === 'frontmatter') {
                    const nextValue = resolveCustomPropertyItemsFromFrontmatter(
                        frontmatter,
                        customPropertyNameFields,
                        customPropertyColorFields
                    );
                    if (!fileData || fileData.customProperty === null || !areCustomPropertyItemsEqual(fileData.customProperty, nextValue)) {
                        update.customProperty = nextValue;
                        hasSafeUpdate = true;
                    }
                } else if (
                    customPropertyEnabled &&
                    settings.customPropertyType === 'wordCount' &&
                    !isExcalidraw &&
                    (!fileData || fileData.customProperty === null)
                ) {
                    update.customProperty = [];
                    hasSafeUpdate = true;
                }

                if (needsFeatureImage && !frontmatterFeatureImageReference) {
                    const shouldMarkMissingFeatureImage =
                        !fileData || fileData.featureImageKey === null || fileData.featureImageStatus === 'unprocessed';
                    if (shouldMarkMissingFeatureImage) {
                        update.featureImageKey = fileData?.featureImageKey ?? '';
                        update.featureImage = this.createEmptyBlob();
                        hasSafeUpdate = true;
                    }
                }

                if (hasSafeUpdate) {
                    return { update, processed: true };
                }

                return { update: null, processed: true };
            }
        }

        let content: string;
        let hasContent = false;
        let bodyStartIndex = 0;
        try {
            if (needsContent) {
                content = await this.readFileContent(job.file);
                hasContent = true;
                bodyStartIndex = resolveMarkdownBodyStartIndex(cachedMetadata, content);
            } else {
                content = '';
            }
        } catch (error) {
            console.error(`Error reading markdown content for ${job.path}:`, error);
            let hasSafeUpdate = false;

            if (customPropertyEnabled && settings.customPropertyType === 'frontmatter') {
                const nextValue = resolveCustomPropertyItemsFromFrontmatter(
                    frontmatter,
                    customPropertyNameFields,
                    customPropertyColorFields
                );
                if (!fileData || fileData.customProperty === null || !areCustomPropertyItemsEqual(fileData.customProperty, nextValue)) {
                    update.customProperty = nextValue;
                    hasSafeUpdate = true;
                }
            }

            if (needsFeatureImage && frontmatterFeatureImageReference) {
                const featureImageUpdate = await this.processMarkdownFeatureImage({
                    file: job.file,
                    fileData,
                    settings,
                    content: '',
                    frontmatter,
                    bodyStartIndex: 0,
                    isExcalidraw,
                    featureImageReference: frontmatterFeatureImageReference
                });

                if (featureImageUpdate) {
                    update.featureImageKey = featureImageUpdate.featureImageKey;
                    update.featureImage = featureImageUpdate.featureImage;
                    hasSafeUpdate = true;
                }
            }

            if (hasSafeUpdate) {
                return { update, processed: false };
            }

            return { update: null, processed: false };
        }

        const context: MarkdownPipelineContext = {
            file: job.file,
            fileData,
            settings,
            content,
            frontmatter,
            bodyStartIndex,
            isExcalidraw,
            fileModified,
            customPropertyEnabled,
            customPropertyNameFields,
            customPropertyColorFields,
            hasContent,
            featureImageReference: frontmatterFeatureImageReference
        };

        for (const processor of this.processors) {
            if (!processor.needsProcessing(context)) {
                continue;
            }

            const processorUpdate = await processor.run(context);
            if (!processorUpdate) {
                continue;
            }

            if (processorUpdate.preview !== undefined) {
                update.preview = processorUpdate.preview;
            }
            if (processorUpdate.customProperty !== undefined) {
                update.customProperty = processorUpdate.customProperty;
            }
            if (processorUpdate.featureImageKey !== undefined) {
                update.featureImageKey = processorUpdate.featureImageKey;
            }
            if (processorUpdate.featureImage !== undefined) {
                update.featureImage = processorUpdate.featureImage;
            }
        }

        const hasContentUpdate =
            update.preview !== undefined || update.customProperty !== undefined || update.featureImageKey !== undefined;

        if (hasContentUpdate) {
            return { update, processed: true };
        }

        return { update: null, processed: true };
    }

    private async processPreview(context: MarkdownPipelineContext): Promise<MarkdownPipelineUpdate | null> {
        try {
            const previewText = context.isExcalidraw
                ? ''
                : PreviewTextUtils.extractPreviewText(context.content, context.settings, context.frontmatter ?? undefined);

            if (!context.fileData) {
                return { preview: previewText };
            }

            if (previewText.length === 0 && context.fileData.previewStatus === 'none') {
                return null;
            }

            if (context.fileData.previewStatus === 'has') {
                const db = getDBInstance();
                const cachedPreview = db.getCachedPreviewText(context.file.path);
                if (cachedPreview.length > 0 && cachedPreview === previewText) {
                    return null;
                }
            }

            return { preview: previewText };
        } catch (error) {
            console.error(`Error generating preview for ${context.file.path}:`, error);
            if (!context.fileData || context.fileData.previewStatus === 'unprocessed') {
                return { preview: '' };
            }
            return null;
        }
    }

    private async processCustomProperty(context: MarkdownPipelineContext): Promise<MarkdownPipelineUpdate | null> {
        try {
            let nextValue: CustomPropertyItem[] = [];
            if (context.settings.customPropertyType === 'wordCount') {
                if (!context.isExcalidraw) {
                    const count = countWordsForCustomProperty(context.content, context.bodyStartIndex).toString();
                    nextValue = [{ value: count }];
                }
            } else if (context.settings.customPropertyType === 'frontmatter') {
                nextValue = resolveCustomPropertyItemsFromFrontmatter(
                    context.frontmatter,
                    context.customPropertyNameFields,
                    context.customPropertyColorFields
                );
            }

            if (
                !context.fileData ||
                context.fileData.customProperty === null ||
                !areCustomPropertyItemsEqual(context.fileData.customProperty, nextValue)
            ) {
                return { customProperty: nextValue };
            }

            return null;
        } catch (error) {
            console.error(`Error generating custom property for ${context.file.path}:`, error);
            if (!context.fileData || context.fileData.customProperty === null) {
                return { customProperty: [] };
            }
            return null;
        }
    }

    private async processFeatureImage(context: MarkdownPipelineContext): Promise<MarkdownPipelineUpdate | null> {
        const featureImageUpdate = await this.processMarkdownFeatureImage({
            file: context.file,
            fileData: context.fileData,
            settings: context.settings,
            content: context.content,
            frontmatter: context.frontmatter,
            bodyStartIndex: context.bodyStartIndex,
            isExcalidraw: context.isExcalidraw,
            featureImageReference: context.featureImageReference
        });

        if (!featureImageUpdate) {
            return null;
        }

        return {
            featureImageKey: featureImageUpdate.featureImageKey,
            featureImage: featureImageUpdate.featureImage
        };
    }

    private async processMarkdownFeatureImage(params: {
        file: TFile;
        fileData: FileData | null;
        settings: NotebookNavigatorSettings;
        content: string;
        frontmatter: FrontMatterCache | null;
        bodyStartIndex: number;
        isExcalidraw: boolean;
        featureImageReference: FeatureImageReference | null;
    }): Promise<{ featureImageKey: string; featureImage: Blob } | null> {
        if (params.isExcalidraw) {
            const featureImageKey = this.getExcalidrawFeatureImageKey(params.file);
            if (params.fileData && params.fileData.featureImageKey === featureImageKey) {
                return null;
            }

            const thumbnail = await this.createExcalidrawThumbnail(params.file);
            return {
                featureImageKey,
                featureImage: thumbnail ?? this.createEmptyBlob()
            };
        }

        const reference =
            params.featureImageReference ??
            findFeatureImageReference({
                app: this.app,
                file: params.file,
                content: params.content,
                settings: params.settings,
                frontmatter: params.frontmatter,
                bodyStartIndex: params.bodyStartIndex
            });

        if (!reference) {
            const featureImageKey = '';
            if (params.fileData && params.fileData.featureImageKey === featureImageKey) {
                return null;
            }
            return {
                featureImageKey,
                featureImage: this.createEmptyBlob()
            };
        }

        const featureImageKey = this.getFeatureImageKey(reference);
        const hasStableThumbnail = params.fileData?.featureImageKey === featureImageKey && params.fileData.featureImageStatus === 'has';

        if (hasStableThumbnail) {
            return null;
        }

        try {
            const thumbnail = await this.createThumbnailBlob(reference, params.settings);
            return {
                featureImageKey,
                featureImage: thumbnail ?? this.createEmptyBlob()
            };
        } catch (error) {
            console.error(`Error generating feature image for ${params.file.path}:`, error);
            // Return an empty blob as a durable "attempted" marker so the file doesn't stay `unprocessed` forever.
            return {
                featureImageKey,
                featureImage: this.createEmptyBlob()
            };
        }
    }
}
