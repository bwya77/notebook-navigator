# Notebook Navigator metadata pipeline

## Table of contents

- [Overview](#overview)
- [Pipeline components](#pipeline-components)
- [Full cache rebuild](#full-cache-rebuild)
- [Markdown pipeline stages](#markdown-pipeline-stages)
- [Completion signals](#completion-signals)

## Overview

Notebook Navigator builds a local metadata cache in IndexedDB and mirrors it into an in-memory cache for synchronous reads during rendering.

The cache stores:

- File mtimes plus provider-specific processed mtimes
- Tags, frontmatter-derived metadata, preview status, feature image status/key, and custom property values
- Preview text and feature image blobs in dedicated stores (status fields live in the main record)

## Pipeline components

- `StorageContext` (`src/context/StorageContext.tsx`) owns cache rebuild orchestration, provider queuing, and tag tree rebuild scheduling.
- `IndexedDBStorage` (`src/storage/IndexedDBStorage.ts`) persists file records and emits `onContentChange` events.
- `MemoryFileCache` (`src/storage/MemoryFileCache.ts`) mirrors IndexedDB file records for synchronous access.
- `ContentProviderRegistry` (`src/services/content/ContentProviderRegistry.ts`) runs provider batches and coordinates settings changes.
- Content providers (`src/services/content/*`):
  - `MarkdownPipelineContentProvider` (`markdownPipeline`): preview, custom property, markdown feature images
  - `TagContentProvider` (`tags`): tag extraction from Obsidian metadata cache
  - `MetadataContentProvider` (`metadata`): frontmatter metadata + hidden state
  - `FeatureImageContentProvider` (`fileThumbnails`): non-markdown thumbnails (PDF covers)

```mermaid
graph TD
    User[User action] --> Trigger[Settings button / command palette]
    Trigger --> Plugin[NotebookNavigatorPlugin.rebuildCache]
    Plugin --> View[NotebookNavigatorView.rebuildCache]
    View --> Storage[StorageContext.rebuildCache]

    Storage --> DB[IndexedDBStorage + MemoryFileCache]
    Storage --> Registry[ContentProviderRegistry]
    Registry --> MP[MarkdownPipelineContentProvider]
    Registry --> Tags[TagContentProvider]
    Registry --> Meta[MetadataContentProvider]
    Registry --> Thumbs[FeatureImageContentProvider]

    MP --> DB
    Tags --> DB
    Meta --> DB
    Thumbs --> DB
```

## Full cache rebuild

The rebuild flow starts from Settings → Notebook Navigator → Advanced → Rebuild cache (or the `notebook-navigator:rebuild-cache` command).

```mermaid
sequenceDiagram
    actor User
    participant Settings as AdvancedTab
    participant Plugin as NotebookNavigatorPlugin
    participant View as NotebookNavigatorView
    participant Storage as StorageContext
    participant Registry as ContentProviderRegistry
    participant DB as IndexedDBStorage
    participant Obsidian as Obsidian metadataCache
    participant Providers as Content providers

    User->>Settings: Click "Rebuild cache"
    Settings->>Plugin: rebuildCache()
    Plugin->>View: rebuildCache()
    View->>Storage: rebuildCache()

    Storage->>Registry: stopAllProcessing()
    Storage->>DB: clearDatabase()
    Storage->>Storage: reset tag tree + state\nisStorageReady=false

    Storage->>Storage: buildFileCache(isInitialLoad=true)
    Storage->>DB: calculateFileDiff + recordFileChanges
    Storage->>Storage: rebuildTagTree()
    Storage->>Storage: isStorageReady=true

    Storage->>Obsidian: queueMetadataContentWhenReady(markdown files)
    Storage->>Registry: queue fileThumbnails (PDF)

    par Background content generation
        Registry->>Providers: startProcessing(settings)\nqueueFiles(files)
        Providers->>DB: write content updates
        DB-->>Storage: onContentChange(changes)
        Storage->>Storage: scheduleTagTreeRebuild() when tags change
    end
```

### What gets queued after the database reset

- `recordFileChanges(...)` writes file records without clearing provider output fields for existing paths. Providers use processed mtimes and status fields to decide what needs regeneration.
- `queueMetadataContentWhenReady(...)` gates markdown work on `app.metadataCache.getFileCache(file)` being available.
- PDF thumbnail generation is queued directly through the registry (`fileThumbnails`).

## Markdown pipeline stages

`MarkdownPipelineContentProvider` runs a processor chain for markdown-derived outputs. Each processor inspects a shared context (settings, file data, frontmatter, optional file content) and returns a partial update.

```mermaid
flowchart LR
    A[Job: markdown file] --> B[Read metadata cache\nfrontmatter + offsets]
    B --> C{Needs body read?}
    C -->|Yes| D[Read markdown content]
    C -->|No| E[Skip body read]
    D --> F[Build pipeline context]
    E --> F
    F --> P1[Processor: preview]
    P1 --> P2[Processor: custom property]
    P2 --> P3[Processor: feature image]
    P3 --> G[Write patch to IndexedDB\nupdate status fields + markdownPipelineMtime]
```

## Completion signals

- Storage is ready when `StorageContext` completes the initial diff + tag tree rebuild and sets `isStorageReady=true`.
- A full rebuild is complete when enabled content types have no remaining files with pending status fields (the rebuild notice clears).
