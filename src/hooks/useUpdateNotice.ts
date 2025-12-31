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

import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../context/ServicesContext';
import type { ReleaseUpdateNotice } from '../services/ReleaseCheckService';
import { compareVersions } from '../releaseNotes';

/** State returned by the useUpdateNotice hook */
interface UpdateNoticeState {
    bannerNotice: ReleaseUpdateNotice | null;
    updateAvailableVersion: string | null;
    markAsDisplayed: (version: string) => Promise<void>;
}

/**
 * Provides access to the pending release update notice and a handler to mark it as shown.
 */
export function useUpdateNotice(): UpdateNoticeState {
    const { plugin } = useServices();
    const [bannerNotice, setBannerNotice] = useState<ReleaseUpdateNotice | null>(() => plugin.getPendingUpdateNotice());

    // Subscribe to update notice changes
    useEffect(() => {
        // Generate unique listener ID to avoid conflicts
        const id = `update-notice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const listener = (value: ReleaseUpdateNotice | null) => {
            setBannerNotice(value);
        };

        plugin.registerUpdateNoticeListener(id, listener);

        return () => {
            plugin.unregisterUpdateNoticeListener(id);
        };
    }, [plugin]);

    const updateAvailableVersion = (() => {
        if (!plugin.settings.checkForUpdatesOnStart) {
            return null;
        }

        const latestKnownRelease = plugin.getLatestKnownRelease();
        if (!latestKnownRelease) {
            return null;
        }

        return compareVersions(latestKnownRelease, plugin.manifest.version) > 0 ? latestKnownRelease : null;
    })();

    // Callback to mark a specific version as having been displayed to the user
    const markAsDisplayed = useCallback(
        async (version: string) => {
            await plugin.markUpdateNoticeAsDisplayed(version);
        },
        [plugin]
    );

    return {
        bannerNotice,
        updateAvailableVersion,
        markAsDisplayed
    };
}
