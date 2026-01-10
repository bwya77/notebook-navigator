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

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Notice, TFile } from 'obsidian';
import { getWeek, getWeekYear } from 'date-fns';
import { getCurrentLanguage, strings } from '../i18n';
import { ConfirmModal } from '../modals/ConfirmModal';
import { useServices } from '../context/ServicesContext';
import { useSettingsState } from '../context/SettingsContext';
import { useFileCache } from '../context/StorageContext';
import { runAsyncAction } from '../utils/async';
import {
    createDailyNote,
    getDailyNoteFile,
    getDailyNoteFilename,
    getDailyNoteSettings as getCoreDailyNoteSettings
} from '../utils/dailyNotes';
import { getMomentApi, type MomentApi, type MomentInstance } from '../utils/moment';
import { getCalendarWeekConfig } from '../utils/calendarWeekConfig';
import { ServiceIcon } from './ServiceIcon';
import { useFileOpener } from '../hooks/useFileOpener';

interface CalendarDay {
    date: MomentInstance;
    iso: string;
    inMonth: boolean;
    file: TFile | null;
}

interface CalendarWeek {
    key: string;
    weekNumber: number;
    days: CalendarDay[];
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function formatIsoDate(date: MomentInstance): string {
    return date.format('YYYY-MM-DD');
}

function resolveMomentLocale(requestedLocale: string, momentApi: MomentApi | null, fallbackLocale: string): string {
    // `moment` locale ids are not guaranteed to be canonical BCP-47 tags (and may use `_`); normalize and fall back
    // to the best available match (full tag -> lowercase -> base language).
    if (!momentApi) {
        return fallbackLocale || 'en';
    }

    const available = new Set(momentApi.locales());
    const normalized = (requestedLocale || '').replace(/_/g, '-');
    if (available.has(normalized)) {
        return normalized;
    }

    const lower = normalized.toLowerCase();
    if (available.has(lower)) {
        return lower;
    }

    const base = lower.split('-')[0];
    if (base && available.has(base)) {
        return base;
    }

    return fallbackLocale || momentApi.locale() || 'en';
}

function getDayOfWeek(date: MomentInstance): number {
    // Use the JS Date weekday (0..6, Sunday..Saturday) to avoid relying on locale-specific moment formatting tokens.
    return date.toDate().getDay();
}

function startOfWeek(date: MomentInstance, weekStartsOn: number): MomentInstance {
    // Compute week starts using date-fns locale rules (first day of week) while keeping moment for date math/formatting.
    const dayOfWeek = getDayOfWeek(date);
    const diff = (dayOfWeek - weekStartsOn + 7) % 7;
    return date.clone().subtract(diff, 'day').startOf('day');
}

export interface NavigationPaneCalendarProps {
    onWeekCountChange?: (count: number) => void;
}

export function NavigationPaneCalendar({ onWeekCountChange }: NavigationPaneCalendarProps) {
    const { app, isMobile } = useServices();
    const settings = useSettingsState();
    const { getDB } = useFileCache();
    const openFile = useFileOpener();

    const momentApi = getMomentApi();
    const [cursorDate, setCursorDate] = useState<MomentInstance | null>(() => (momentApi ? momentApi().startOf('day') : null));

    const [vaultVersion, setVaultVersion] = useState(0);
    const [contentVersion, setContentVersion] = useState(0);
    const visibleDailyNotePathsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const onVaultUpdate = () => setVaultVersion(v => v + 1);
        const createRef = app.vault.on('create', onVaultUpdate);
        const deleteRef = app.vault.on('delete', onVaultUpdate);
        const renameRef = app.vault.on('rename', onVaultUpdate);

        return () => {
            app.vault.offref(createRef);
            app.vault.offref(deleteRef);
            app.vault.offref(renameRef);
        };
    }, [app.vault]);

    useEffect(() => {
        const db = getDB();
        return db.onContentChange(changes => {
            const visiblePaths = visibleDailyNotePathsRef.current;
            const hasCalendarRelevantChange = changes.some(change => {
                if (!visiblePaths.has(change.path)) {
                    return false;
                }
                return (
                    change.changes.featureImage !== undefined ||
                    change.changes.featureImageKey !== undefined ||
                    change.changes.featureImageStatus !== undefined
                );
            });

            if (hasCalendarRelevantChange) {
                setContentVersion(v => v + 1);
            }
        });
    }, [getDB]);

    useEffect(() => {
        // Obsidian exposes `window.moment` after startup; in tests (or very early) it may be unavailable.
        if (!momentApi || cursorDate) {
            return;
        }
        setCursorDate(momentApi().startOf('day'));
    }, [cursorDate, momentApi]);

    const displayLocale = useMemo(() => {
        if (!momentApi) {
            return 'en';
        }

        // Month name / weekday labels follow the current UI language by default.
        const currentLanguage = getCurrentLanguage();
        const fallback = momentApi.locale() || 'en';
        const requested = (currentLanguage || fallback).replace(/_/g, '-');

        return resolveMomentLocale(requested, momentApi, fallback);
    }, [momentApi]);

    const calendarRulesLocale = useMemo(() => {
        if (!momentApi) {
            return 'en';
        }
        // Week rules (week starts on, week number calculation) can differ from display locale; allow override.
        const requested = settings.calendarLocale === 'system-default' ? displayLocale : settings.calendarLocale;
        return resolveMomentLocale(requested, momentApi, displayLocale);
    }, [displayLocale, momentApi, settings.calendarLocale]);

    const weekConfig = useMemo(() => getCalendarWeekConfig(calendarRulesLocale), [calendarRulesLocale]);
    const weekStartsOn = weekConfig.weekStartsOn;

    const weekdays = useMemo(() => {
        if (!momentApi) {
            return [];
        }

        const firstDay = weekStartsOn;
        const labels = momentApi().locale(displayLocale).localeData().weekdaysMin();
        if (!Array.isArray(labels) || labels.length !== 7) {
            return [];
        }
        return [...labels.slice(firstDay), ...labels.slice(0, firstDay)];
    }, [displayLocale, momentApi, weekStartsOn]);

    const dailyNoteSettings = useMemo(() => {
        // Force refresh when vault contents change so `getDailyNoteFile()` reflects created/renamed/deleted daily notes.
        void vaultVersion;
        return getCoreDailyNoteSettings(app);
    }, [app, vaultVersion]);

    const weeks = useMemo<CalendarWeek[]>(() => {
        if (!momentApi || !cursorDate) {
            return [];
        }

        const cursor = cursorDate.clone().startOf('day');
        const monthStart = cursor.clone().startOf('month');
        const gridStart = startOfWeek(monthStart, weekStartsOn);

        const weeksToShow = clamp(settings.calendarWeeksToShow, 1, 6);
        let startIndex: number;
        let endIndexExclusive: number;

        // `6` means "full month": render as many week rows as needed to cover the month grid (capped at 6).
        if (weeksToShow === 6) {
            const monthEnd = monthStart.clone().endOf('month');
            const gridEndWeekStart = startOfWeek(monthEnd, weekStartsOn);
            const totalWeeks = clamp(gridEndWeekStart.diff(gridStart, 'weeks') + 1, 1, 6);
            startIndex = 0;
            endIndexExclusive = totalWeeks;
        } else {
            // For 1..5 weeks: keep the current week in view, and center it when possible.
            const cursorWeekStart = startOfWeek(cursor.clone(), weekStartsOn);
            const cursorWeekIndex = clamp(cursorWeekStart.diff(gridStart, 'weeks'), 0, 5);
            const maxStart = 6 - weeksToShow;
            startIndex = clamp(cursorWeekIndex - Math.floor((weeksToShow - 1) / 2), 0, maxStart);
            endIndexExclusive = startIndex + weeksToShow;
        }

        const visibleWeeks: CalendarWeek[] = [];
        for (let weekOffset = startIndex; weekOffset < endIndexExclusive; weekOffset++) {
            const weekStart = gridStart.clone().add(weekOffset, 'week');
            const weekNumber = getWeek(weekStart.toDate(), weekConfig);
            const weekYear = getWeekYear(weekStart.toDate(), weekConfig);

            const days: CalendarDay[] = [];
            for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
                const date = weekStart.clone().add(dayOffset, 'day');
                const inMonth = date.month() === monthStart.month() && date.year() === monthStart.year();
                const file = dailyNoteSettings ? getDailyNoteFile(app, date, dailyNoteSettings) : null;
                days.push({ date, iso: formatIsoDate(date), inMonth, file });
            }

            visibleWeeks.push({
                key: `week-${weekYear}-W${weekNumber}`,
                weekNumber,
                days
            });
        }

        return visibleWeeks;
    }, [app, cursorDate, dailyNoteSettings, momentApi, settings.calendarWeeksToShow, weekConfig, weekStartsOn]);

    const visibleDailyNotePaths = useMemo(() => {
        const paths = new Set<string>();
        for (const week of weeks) {
            for (const day of week.days) {
                if (day.file) {
                    paths.add(day.file.path);
                }
            }
        }
        return paths;
    }, [weeks]);
    visibleDailyNotePathsRef.current = visibleDailyNotePaths;

    useLayoutEffect(() => {
        if (weeks.length === 0) {
            return;
        }
        onWeekCountChange?.(weeks.length);
    }, [onWeekCountChange, weeks.length]);

    const featureImageUrlMapRef = useRef<Map<string, { key: string; url: string }>>(new Map());
    const [featureImageUrls, setFeatureImageUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        return () => {
            // Always release object URLs on unmount to avoid leaking blobs.
            const existing = featureImageUrlMapRef.current;
            for (const entry of existing.values()) {
                URL.revokeObjectURL(entry.url);
            }
            existing.clear();
        };
    }, []);

    useEffect(() => {
        let isActive = true;

        // Only days with a daily note AND a computed feature-image key participate in background image loading.
        const noteDays: { iso: string; file: TFile; key: string }[] = [];
        const db = getDB();

        for (const week of weeks) {
            for (const day of week.days) {
                if (!day.file) {
                    continue;
                }

                const record = db.getFile(day.file.path);
                const featureKey = record?.featureImageKey ?? null;
                const featureStatus = record?.featureImageStatus ?? null;
                if (featureStatus !== 'has' || !featureKey || featureKey === '') {
                    continue;
                }

                noteDays.push({ iso: day.iso, file: day.file, key: featureKey });
            }
        }

        const previousMap = featureImageUrlMapRef.current;
        const nextMap = new Map<string, { key: string; url: string }>();

        const createdUrls: string[] = [];

        const fetchUrls = async () => {
            try {
                await Promise.all(
                    noteDays.map(async entry => {
                        // Reuse existing object URLs when the feature image key is unchanged for that day.
                        const existing = previousMap.get(entry.iso);
                        if (existing && existing.key === entry.key) {
                            nextMap.set(entry.iso, existing);
                            return;
                        }

                        let blob: Blob | null = null;
                        try {
                            blob = await db.getFeatureImageBlob(entry.file.path, entry.key);
                        } catch {
                            return;
                        }

                        if (!blob) {
                            return;
                        }

                        const url = URL.createObjectURL(blob);
                        createdUrls.push(url);
                        nextMap.set(entry.iso, { key: entry.key, url });
                    })
                );

                if (!isActive) {
                    // Component was unmounted while blobs were loading; release newly created URLs.
                    createdUrls.forEach(url => URL.revokeObjectURL(url));
                    return;
                }

                // Release URLs that are no longer referenced by the next map.
                for (const [iso, entry] of previousMap.entries()) {
                    const next = nextMap.get(iso);
                    if (!next || next.url !== entry.url) {
                        URL.revokeObjectURL(entry.url);
                    }
                }

                featureImageUrlMapRef.current = nextMap;
                setFeatureImageUrls(Object.fromEntries([...nextMap.entries()].map(([iso, entry]) => [iso, entry.url])));
            } catch (error) {
                createdUrls.forEach(url => URL.revokeObjectURL(url));
                if (isActive) {
                    console.error('Failed to load calendar feature images', error);
                }
            }
        };

        runAsyncAction(() => fetchUrls());

        return () => {
            isActive = false;
        };
    }, [contentVersion, getDB, weeks]);

    const headerLabel = useMemo(() => {
        if (!momentApi || !cursorDate) {
            return '';
        }
        return cursorDate.clone().locale(displayLocale).format('MMMM YYYY');
    }, [cursorDate, displayLocale, momentApi]);

    const handleNavigateMonth = useCallback(
        (delta: number) => {
            if (!momentApi) {
                return;
            }
            setCursorDate(prev => (prev ?? momentApi().startOf('day')).clone().add(delta, 'month'));
        },
        [momentApi]
    );

    const handleToday = useCallback(() => {
        if (!momentApi) {
            return;
        }
        setCursorDate(momentApi().startOf('day'));
    }, [momentApi]);

    const collapseNavigationIfMobile = useCallback(() => {
        if (!isMobile || !app.workspace.leftSplit) {
            return;
        }
        // On mobile, opening a daily note should feel like navigating away from the sidebar.
        app.workspace.leftSplit.collapse();
    }, [app, isMobile]);

    const openOrCreateDailyNote = useCallback(
        (date: MomentInstance, existingFile: TFile | null) => {
            const dailySettings = dailyNoteSettings;
            if (!dailySettings) {
                new Notice(strings.navigationCalendar.dailyNotesNotEnabled);
                return;
            }

            if (existingFile) {
                openFile(existingFile, { active: true });
                collapseNavigationIfMobile();
                return;
            }

            const filename = getDailyNoteFilename(date, dailySettings);

            const createFile = async () => {
                const created = await createDailyNote(app, date, dailySettings);
                if (!created) {
                    return;
                }

                setVaultVersion(v => v + 1);
                openFile(created, { active: true });

                collapseNavigationIfMobile();
            };

            if (settings.calendarConfirmBeforeCreate) {
                new ConfirmModal(
                    app,
                    strings.navigationCalendar.createDailyNote.title,
                    strings.navigationCalendar.createDailyNote.message.replace('{filename}', filename),
                    createFile,
                    strings.navigationCalendar.createDailyNote.confirmButton,
                    { confirmButtonClass: 'mod-cta' }
                ).open();
                return;
            }

            runAsyncAction(() => createFile());
        },
        [app, collapseNavigationIfMobile, dailyNoteSettings, openFile, settings.calendarConfirmBeforeCreate]
    );

    if (!momentApi || !cursorDate) {
        return null;
    }

    const showWeekNumbers = settings.calendarShowWeekNumber;

    return (
        <div className="nn-navigation-calendar" aria-label={strings.navigationCalendar.ariaLabel}>
            <div className="nn-navigation-calendar-header">
                <div className="nn-navigation-calendar-month">{headerLabel}</div>
                <div className="nn-navigation-calendar-nav">
                    <button
                        type="button"
                        className="nn-navigation-calendar-nav-button"
                        aria-label={strings.navigationCalendar.previousMonthAria}
                        onClick={() => handleNavigateMonth(-1)}
                    >
                        <ServiceIcon iconId="lucide-chevron-left" aria-hidden={true} />
                    </button>
                    <button type="button" className="nn-navigation-calendar-today" onClick={handleToday}>
                        {strings.dateGroups.today}
                    </button>
                    <button
                        type="button"
                        className="nn-navigation-calendar-nav-button"
                        aria-label={strings.navigationCalendar.nextMonthAria}
                        onClick={() => handleNavigateMonth(1)}
                    >
                        <ServiceIcon iconId="lucide-chevron-right" aria-hidden={true} />
                    </button>
                </div>
            </div>

            <div className="nn-navigation-calendar-weekdays" data-weeknumbers={showWeekNumbers ? 'true' : undefined}>
                {showWeekNumbers ? <div className="nn-navigation-calendar-weeknumber-spacer" /> : null}
                {weekdays.map(day => (
                    <div key={day} className="nn-navigation-calendar-weekday">
                        {day}
                    </div>
                ))}
            </div>

            <div className="nn-navigation-calendar-weeks" data-weeknumbers={showWeekNumbers ? 'true' : undefined}>
                {weeks.map(week => (
                    <div key={week.key} className="nn-navigation-calendar-week">
                        {showWeekNumbers ? (
                            <div className="nn-navigation-calendar-weeknumber" aria-hidden="true">
                                {week.weekNumber}
                            </div>
                        ) : null}
                        {week.days.map(day => {
                            const dayNumber = day.date.date();
                            const hasDailyNote = Boolean(day.file);
                            const featureImageUrl = featureImageUrls[day.iso] ?? null;

                            const className = [
                                'nn-navigation-calendar-day',
                                day.inMonth ? 'is-in-month' : 'is-outside-month',
                                hasDailyNote ? 'has-daily-note' : '',
                                featureImageUrl ? 'has-feature-image' : ''
                            ]
                                .filter(Boolean)
                                .join(' ');

                            const style: React.CSSProperties | undefined = featureImageUrl
                                ? { backgroundImage: `url(${featureImageUrl})` }
                                : undefined;

                            return (
                                <button
                                    key={day.iso}
                                    type="button"
                                    className={className}
                                    style={style}
                                    // Readable label for screen readers (e.g. "January 10, 2026") regardless of the visible day number.
                                    aria-label={day.date.clone().locale(displayLocale).format('LL')}
                                    onClick={() => openOrCreateDailyNote(day.date, day.file)}
                                >
                                    <span className="nn-navigation-calendar-day-number">{dayNumber}</span>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
