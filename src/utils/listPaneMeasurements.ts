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

import type { TFile } from 'obsidian';
import type { FeatureImageStatus, FileData } from '../storage/IndexedDBStorage';
import type { CustomPropertyType } from '../settings/types';
import { isImageFile } from './fileTypeUtils';

/**
 * Layout measurements used by the list pane virtualizer.
 * These values mirror the CSS variables defined in styles.css.
 */
export interface ListPaneMeasurements {
    basePadding: number;
    titleLineHeight: number;
    singleTextLineHeight: number;
    multilineTextLineHeight: number;
    tagRowHeight: number;
    featureImageHeight: number;
    firstHeader: number;
    subsequentHeader: number;
    fileIconSize: number;
    topSpacer: number;
    bottomSpacer: number;
}

const DESKTOP_MEASUREMENTS: ListPaneMeasurements = Object.freeze({
    basePadding: 16, // 8px padding on each side
    titleLineHeight: 20,
    singleTextLineHeight: 19,
    multilineTextLineHeight: 18,
    tagRowHeight: 26, // 22px row + 4px gap
    featureImageHeight: 42,
    firstHeader: 35,
    subsequentHeader: 50,
    fileIconSize: 16,
    topSpacer: 8,
    bottomSpacer: 20
});

const MOBILE_MEASUREMENTS: ListPaneMeasurements = Object.freeze({
    basePadding: 24, // 12px padding on each side
    titleLineHeight: 21,
    singleTextLineHeight: 20,
    multilineTextLineHeight: 19,
    tagRowHeight: 26, // 22px row + 4px gap
    featureImageHeight: 42,
    firstHeader: 43, // 35px + 8px mobile increment
    subsequentHeader: 58, // 50px + 8px mobile increment
    fileIconSize: 20, // 16px + 4px mobile increment
    topSpacer: 8,
    bottomSpacer: 20
});

/**
 * Returns the static measurement set for the current platform.
 */
export function getListPaneMeasurements(isMobile: boolean): ListPaneMeasurements {
    return isMobile ? MOBILE_MEASUREMENTS : DESKTOP_MEASUREMENTS;
}

/**
 * Shared feature image visibility logic for list pane rendering and sizing.
 */
export function shouldShowFeatureImageArea({
    showImage,
    file,
    featureImageStatus,
    hasFeatureImageUrl
}: {
    showImage: boolean;
    file: TFile | null;
    featureImageStatus?: FeatureImageStatus | null;
    hasFeatureImageUrl?: boolean;
}): boolean {
    if (!showImage || !file) {
        return false;
    }

    if (hasFeatureImageUrl) {
        return true;
    }

    if (file.extension === 'canvas' || file.extension === 'base') {
        return true;
    }

    if (isImageFile(file)) {
        return true;
    }

    return featureImageStatus === 'has';
}

export function shouldShowCustomPropertyRow({
    customPropertyType,
    showCustomPropertyInCompactMode,
    isCompactMode,
    file,
    customProperty
}: {
    customPropertyType: CustomPropertyType;
    showCustomPropertyInCompactMode: boolean;
    isCompactMode: boolean;
    file: TFile | null;
    customProperty: FileData['customProperty'] | undefined;
}): boolean {
    if (customPropertyType === 'none') {
        return false;
    }

    if (!file || file.extension !== 'md') {
        return false;
    }

    if (isCompactMode && !showCustomPropertyInCompactMode) {
        return false;
    }

    // Custom property values are stored as an array; an empty array means there are no pills to render.
    return Boolean(customProperty && customProperty.length > 0);
}
