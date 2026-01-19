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

import { useMemo, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { TFile } from 'obsidian';
import { useServices } from '../context/ServicesContext';
import { useActiveProfile, useSettingsUpdate } from '../context/SettingsContext';
import { getActiveVaultProfile } from '../utils/vaultProfiles';

interface NavigationBannerProps {
    path: string;
    onHeightChange?: (height: number) => void;
}

const MIN_BANNER_HEIGHT = 16;

/**
 * Displays an optional image banner above the navigation tree.
 * Supports drag-to-resize for adjusting banner height.
 */
export function NavigationBanner({ path, onHeightChange }: NavigationBannerProps) {
    const { app } = useServices();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const activeProfile = useActiveProfile();
    const updateSettings = useSettingsUpdate();

    // null means auto/full size, number means specific height
    const savedHeight = activeProfile.profile.navigationBannerHeight;
    const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartY, setDragStartY] = useState(0);
    const [dragStartHeight, setDragStartHeight] = useState(0);

    // Resolve the banner file and get its resource path if it exists
    const bannerData = useMemo(() => {
        const file = app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            try {
                const resourcePath = app.vault.getResourcePath(file);
                return { resourcePath, missing: false };
            } catch {
                return { resourcePath: null, missing: true };
            }
        }
        return { resourcePath: null, missing: true };
    }, [app, path]);

    // Get natural image height when loaded
    const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        setNaturalHeight(img.naturalHeight * (img.clientWidth / img.naturalWidth));
    }, []);

    // Calculate the current display height
    const displayHeight = savedHeight !== null ? savedHeight : naturalHeight;

    // Measure banner height and notify parent component when it changes
    useLayoutEffect(() => {
        const element = containerRef.current;
        if (!element || !onHeightChange) {
            return;
        }

        const emitHeight = () => {
            onHeightChange(element.getBoundingClientRect().height);
        };

        // Emit initial height
        emitHeight();

        if (typeof ResizeObserver === 'undefined') {
            return undefined;
        }

        // Watch for size changes and update height
        const observer = new ResizeObserver(() => {
            emitHeight();
        });
        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, [onHeightChange, path, displayHeight]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const currentHeight = containerRef.current?.querySelector('.nn-nav-banner-image')?.getBoundingClientRect().height;
        setIsDragging(true);
        setDragStartY(e.clientY);
        setDragStartHeight(currentHeight ?? naturalHeight ?? 100);
    }, [naturalHeight]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;

        const deltaY = e.clientY - dragStartY;
        const newHeight = Math.max(MIN_BANNER_HEIGHT, dragStartHeight + deltaY);

        // Update height in settings
        updateSettings(settings => {
            const profile = getActiveVaultProfile(settings);
            profile.navigationBannerHeight = newHeight;
        });
    }, [isDragging, dragStartY, dragStartHeight, updateSettings]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Double-click to reset to full size
    const handleDoubleClick = useCallback(() => {
        updateSettings(settings => {
            const profile = getActiveVaultProfile(settings);
            profile.navigationBannerHeight = null;
        });
    }, [updateSettings]);

    // Global mouse event listeners for drag
    useLayoutEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    if (!bannerData.resourcePath) {
        return null;
    }

    const imageStyle: React.CSSProperties = displayHeight !== null
        ? { height: `${displayHeight}px`, width: '100%', objectFit: 'cover' }
        : { width: '100%', height: 'auto' };

    return (
        <div
            className={`nn-nav-banner ${isDragging ? 'is-dragging' : ''}`}
            aria-hidden="true"
            ref={containerRef}
        >
            <img
                ref={imageRef}
                className="nn-nav-banner-image"
                src={bannerData.resourcePath}
                alt=""
                style={imageStyle}
                draggable={false}
                onLoad={handleImageLoad}
            />
            <div
                className="nn-nav-banner-grabber"
                onMouseDown={handleMouseDown}
                onDoubleClick={handleDoubleClick}
                title="Drag to resize, double-click to reset"
            >
                <span className="nn-nav-banner-grabber-icon">⋯</span>
            </div>
        </div>
    );
}
