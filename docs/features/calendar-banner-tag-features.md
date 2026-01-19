# Feature Documentation: Calendar Indicator, Banner Resize, and Tag Click Interception

This document details three UI features implemented in Notebook Navigator: the calendar daily note dot indicator, navigation banner resize functionality, and tag click interception.

---

## 1. Calendar Daily Note Dot Indicator

### Overview

The calendar feature displays a visual indicator for days that have associated daily notes. Instead of highlighting the entire day cell, a small white dot appears underneath the day number—similar to the macOS dock indicator for open applications.

### Implementation

#### Settings Configuration

**Type Definition** (`src/settings/types.ts`):
```typescript
export type CalendarDailyNoteIndicator = 'highlight' | 'dot';
```

**Default Setting** (`src/settings/defaultSettings.ts`):
```typescript
calendarDailyNoteIndicator: 'dot',
```

#### Component Changes

**NavigationPaneCalendar.tsx**:
The calendar component passes the indicator type as a data attribute to enable CSS conditional styling:

```typescript
const dailyNoteIndicator = settings.calendarDailyNoteIndicator ?? 'dot';

// In JSX:
<div
    className="nn-navigation-calendar"
    data-daily-note-indicator={dailyNoteIndicator}
>
```

#### CSS Implementation

**navigation-calendar.css**:
```css
/* Position the day number relatively to anchor the dot */
.nn-navigation-calendar[data-daily-note-indicator='dot'] .nn-navigation-calendar-day.has-daily-note .nn-navigation-calendar-day-number {
    position: relative;
}

/* Create the dot indicator using ::after pseudo-element */
.nn-navigation-calendar[data-daily-note-indicator='dot'] .nn-navigation-calendar-day.has-daily-note .nn-navigation-calendar-day-number::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: calc(50% + 2px);  /* Offset to visually center under the number */
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background-color: white;
}

/* Remove the background highlight when using dot indicator */
.nn-navigation-calendar[data-daily-note-indicator='dot'] .nn-navigation-calendar-day.has-daily-note {
    background-color: transparent !important;
}
```

#### Key Design Decisions

1. **Pseudo-element approach**: Using `::after` on the day number span keeps the DOM clean and allows pure CSS implementation.
2. **Visual centering offset**: The `left: calc(50% + 2px)` offset compensates for visual perception—pure mathematical centering appeared off-center due to the number glyph shapes.
3. **Data attribute pattern**: Using `data-daily-note-indicator` allows the setting to control CSS without JavaScript DOM manipulation.

---

## 2. Navigation Banner Resize

### Overview

The navigation banner displays an optional image above the navigation tree. Users can drag to resize the banner height—full size by default, collapsible to a minimum of 16px. Double-click resets to full size.

### Implementation

#### Settings Configuration

**Type Definition** (`src/settings/types.ts`):
```typescript
// In VaultProfile interface:
navigationBanner: string | null;
navigationBannerHeight: number | null;  // null = full/auto size
```

**Default Setting** (`src/settings/defaultSettings.ts`):
```typescript
navigationBannerHeight: null,
```

#### Component Implementation

**NavigationBanner.tsx**:

```typescript
const MIN_BANNER_HEIGHT = 16;

export function NavigationBanner({ path, onHeightChange }: NavigationBannerProps) {
    const { app } = useServices();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const activeProfile = useActiveProfile();
    const updateSettings = useSettingsUpdate();

    // null means auto/full size, number means specific height
    const savedHeight = activeProfile.profile.navigationBannerHeight;
    const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartY, setDragStartY] = useState(0);
    const [dragStartHeight, setDragStartHeight] = useState(0);

    // Calculate display height
    const displayHeight = savedHeight !== null ? savedHeight : naturalHeight;

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const currentHeight = containerRef.current
            ?.querySelector('.nn-nav-banner-image')
            ?.getBoundingClientRect().height;
        setIsDragging(true);
        setDragStartY(e.clientY);
        setDragStartHeight(currentHeight ?? naturalHeight ?? 100);
    }, [naturalHeight]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;
        const deltaY = e.clientY - dragStartY;
        const newHeight = Math.max(MIN_BANNER_HEIGHT, dragStartHeight + deltaY);

        updateSettings(settings => {
            const profile = getActiveVaultProfile(settings);
            profile.navigationBannerHeight = newHeight;
        });
    }, [isDragging, dragStartY, dragStartHeight, updateSettings]);

    const handleDoubleClick = useCallback(() => {
        updateSettings(settings => {
            const profile = getActiveVaultProfile(settings);
            profile.navigationBannerHeight = null;  // Reset to full size
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

    const imageStyle: React.CSSProperties = displayHeight !== null
        ? { height: `${displayHeight}px`, width: '100%', objectFit: 'cover' }
        : { width: '100%', height: 'auto' };

    return (
        <div className={`nn-nav-banner ${isDragging ? 'is-dragging' : ''}`}>
            <img
                className="nn-nav-banner-image"
                src={bannerData.resourcePath}
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
```

#### CSS Implementation

**navigation-scroller.css**:
```css
.nn-nav-banner-grabber {
    position: absolute;
    bottom: calc(var(--nn-nav-banner-padding-vertical, 8px) + 4px);
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 16px;
    background-color: rgba(0, 0, 0, 0.6);
    color: white;
    border-radius: 4px;
    font-size: 14px;
    line-height: 1;
    cursor: ns-resize;
    opacity: 0;
    transition: opacity 150ms ease;
    user-select: none;
}

.nn-nav-banner:hover .nn-nav-banner-grabber {
    opacity: 1;
}

.nn-nav-banner.is-dragging .nn-nav-banner-grabber {
    opacity: 1;
}
```

#### Context Change Detection

**SettingsContext.tsx** - Added memoization check:
```typescript
const navigationBannerHeightEqual =
    previous?.profile.navigationBannerHeight === profile.navigationBannerHeight;
```

#### Key Design Decisions

1. **Global event listeners**: Mouse move/up events are attached to `window` during drag to capture movement even outside the component.
2. **Object-fit: cover**: The image maintains aspect ratio while filling the container, cropping edges as needed.
3. **Null for auto-size**: Using `null` to represent "no custom height" allows distinguishing between "unset" and "set to 0".
4. **Minimum height of 16px**: Allows collapsing the banner significantly while keeping it visible for re-expansion.

---

## 3. Tag Click Interception

### Overview

This feature intercepts tag clicks within Obsidian's markdown preview to provide custom navigation behavior. When a user clicks a tag in the note content, instead of triggering Obsidian's default search behavior, the plugin navigates to the tag in the navigation pane.

### Implementation

#### Event Handling Flow

1. User clicks a tag (e.g., `#project/work`) in markdown preview
2. Event listener on the preview container intercepts the click
3. Tag path is extracted from the target element
4. Default behavior is prevented
5. Navigation pane reveals and selects the tag

#### Component Implementation

**ListPaneContent.tsx** - Event listener setup:

```typescript
useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleTagClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        // Check if clicked element is a tag
        if (!target.classList.contains('tag') &&
            !target.closest('.tag')) {
            return;
        }

        const tagElement = target.classList.contains('tag')
            ? target
            : target.closest('.tag') as HTMLElement;

        if (!tagElement) return;

        // Extract tag path from href or text content
        const href = tagElement.getAttribute('href');
        let tagPath: string;

        if (href?.startsWith('#')) {
            tagPath = href.slice(1);  // Remove leading #
        } else {
            tagPath = tagElement.textContent?.replace(/^#/, '') ?? '';
        }

        if (!tagPath) return;

        // Prevent default Obsidian behavior
        e.preventDefault();
        e.stopPropagation();

        // Navigate to tag in navigation pane
        navigationService.revealTag(tagPath);
    };

    container.addEventListener('click', handleTagClick, true);

    return () => {
        container.removeEventListener('click', handleTagClick, true);
    };
}, [navigationService]);
```

#### Navigation Service

**NavigationService.ts** - Tag reveal method:

```typescript
public revealTag(tagPath: string): void {
    // Ensure tag view is active
    if (this.getCurrentView() !== 'tags') {
        this.setView('tags');
    }

    // Expand parent tags if nested
    const segments = tagPath.split('/');
    let currentPath = '';

    for (let i = 0; i < segments.length - 1; i++) {
        currentPath += (currentPath ? '/' : '') + segments[i];
        this.expandTag(currentPath);
    }

    // Select and scroll to the tag
    this.selectTag(tagPath);
    this.scrollToTag(tagPath);
}
```

#### Key Design Decisions

1. **Capture phase**: Using `{ capture: true }` ensures the handler runs before Obsidian's handlers.
2. **Delegation pattern**: Single listener on container handles all tag clicks within.
3. **Path normalization**: Handles both `#tag` format (from href) and plain text format.
4. **Nested tag support**: Automatically expands parent tags when navigating to nested tags.

### Edge Cases Handled

- Tags with special characters
- Nested tags (e.g., `#project/work/urgent`)
- Tags in different markdown contexts (inline, frontmatter display)
- Mobile touch events (converted to click events by Obsidian)

---

## Files Modified Summary

| Feature | Files Modified |
|---------|---------------|
| Calendar Dot Indicator | `types.ts`, `defaultSettings.ts`, `NavigationPaneCalendar.tsx`, `navigation-calendar.css`, all locale files |
| Banner Resize | `types.ts`, `defaultSettings.ts`, `NavigationBanner.tsx`, `navigation-scroller.css`, `SettingsContext.tsx`, `vaultProfiles.ts` |
| Tag Click Interception | `ListPaneContent.tsx`, `NavigationService.ts` |

---

## Testing Checklist

### Calendar Dot Indicator
- [ ] Dot appears under days with daily notes
- [ ] Dot is visually centered under the number
- [ ] Background highlight is removed when using dot mode
- [ ] Setting toggle works between 'highlight' and 'dot'

### Banner Resize
- [ ] Grabber appears on hover
- [ ] Dragging up reduces banner height
- [ ] Dragging down increases banner height
- [ ] Minimum height (16px) is enforced
- [ ] Double-click resets to full size
- [ ] Height persists across sessions
- [ ] Image scales with object-fit: cover

### Tag Click Interception
- [ ] Clicking tag in preview navigates to tag in nav pane
- [ ] Nested tags expand parent folders
- [ ] Default Obsidian search is prevented
- [ ] Works in both reading and live preview modes
