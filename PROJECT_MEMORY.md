# Project Memory

## Overview
- Project: Task Manager KRK App
- App type: client-rendered task management dashboard with Firebase backend
- Entry pages:
  - `index.html`: main authenticated app
  - `login.html`: authentication page
- Tooling:
  - Vite is present in `package.json`
  - Runtime is primarily plain HTML/CSS/JavaScript with browser ES modules and a Firebase import map

## Architecture
- The app is not built with React, Vue, or another frontend framework.
- UI is hand-built with direct DOM manipulation, template strings, and event listeners.
- Core boot flow lives in `src/js/app.js`:
  - initializes theme
  - lazy-loads Firebase
  - checks auth state
  - provisions default workspace/board data
  - boots dashboards and modals for the active workspace
- Firebase config is in `src/js/firebase-config.js`.
- Auth page logic is in `src/js/auth.js`.

## Data Model
- Firestore is the primary source of truth.
- Main hierarchy is organized per user, then workspace, then board.
- Example task path:
  - `users/{uid}/workspaces/{wid}/boards/{bid}/tasks/{tid}`
- Parallel collections/services exist for:
  - workspaces
  - boards
  - labels
  - tasks
  - bookmarks
  - notes
- State is mostly live-synced via Firestore `onSnapshot`.
- Local UI preferences are stored in `localStorage`, including:
  - theme
  - last active workspace
  - bucket sort modes

## UI Modules
- Main task board:
  - `src/js/dashboard.js`
- Task modal/detail:
  - `src/js/task-detail.js`
- Bookmarks:
  - `src/js/bookmark-dashboard.js`
  - `src/js/bookmark-modal.js`
- Notes:
  - `src/js/note-dashboard.js`
  - `src/js/note-modal.js`
- Calendar/filtering:
  - `src/js/calendar.js`
- Theme manager:
  - `src/js/theme.js`

## Behavior Pattern
- Workspace changes trigger a re-boot of the relevant modules.
- The app uses global `window` references for shared runtime coordination.
- Rendering is imperative rather than component-driven.
- The structure is modular, but state/control flow is still centralized in the boot layer.

## Visual / Aesthetic Summary
- Overall style:
  - modern SaaS dashboard
  - productivity-focused
  - minimal but polished
  - functional rather than brand-heavy
- Visual characteristics:
  - rounded cards and panels
  - thin borders
  - subtle shadows
  - indigo accent color
  - slate/gray neutral palette
  - compact controls and dense utility layout
  - Material Symbols icons
  - Inter typography
- Layout pattern:
  - collapsible left sidebar
  - top utility/search bar
  - horizontally scrolling bucket board
  - modal-based detail editing
  - calendar/date filtering controls
- Task UI feels closest to a Trello/Notion-style board adapted into a custom Firebase app.

## Design System Notes
- Main styling lives in:
  - `src/css/style.css`
  - `src/css/modal.css`
  - `src/css/task-detail.css`
  - `src/css/calendar.css`
  - `src/css/auth.css`
- `src/css/style.css` defines:
  - theme tokens
  - spacing scale
  - typography scale
  - radii
  - shadows
  - component primitives
- Light and dark themes are both supported.
- Current implementation appears to default to light theme in practice.

## Important Observations
- The project mixes Vite package tooling with direct browser import-map usage for Firebase.
- Styling is split across CSS plus a noticeable amount of inline styling in HTML and JS-rendered templates.
- This makes iteration fast, but visual rules are somewhat distributed.
- The app is pragmatic and feature-focused, with a custom-built feel rather than a heavily abstracted architecture.

## Recommended Use
- Use this file as quick context before making architectural, UI, or styling changes.
- If future work changes the app structure significantly, update this file first.
