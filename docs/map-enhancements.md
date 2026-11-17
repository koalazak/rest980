# Map history enhancements

These features require the optional firmware 2 background history recorder. Mount the configured history directory for persistence. All new endpoints inherit existing API authentication.

## Persistent display preferences and recorder diagnostics

With `mapHistoryDirectory` enabled, `/api/local/history/enhancements` exposes supported features and saved display settings. Settings use `settings.json` in the history directory and retain validated legacy canvas values on first use. Authenticated GET/POST `/api/local/history/enhancements/settings` reads/saves canvas size, offsets, refresh interval and trajectory fit. Mission summaries retain robot-reported maxima; recorder status distinguishes transport, state reception, coordinates and successful writes. Coordinates are not calibrated to metres. No new robot connection is opened.

## Confirmed batch deletion and opt-in retention

GET `/api/local/history/enhancements/retention` reads policy/status. POST `retention/plan` accepts explicit `ids` (1–200) or a `policy` object with `enabled`, `maxCount` and `maxDays`. Preview returns a five-minute, single-use token and an exact target list. POST `retention/apply` with `{ "token": "..." }` revalidates the snapshot before deleting. Automatic cleanup is off by default. Zero disables a limit; either exceeded positive limit qualifies. Active/recharging missions remain protected. Policies persist in `retention.json`. Each scheduled run deletes at most 200 missions. Deleted maps cannot be recovered.

## Mission notes, exports and trajectory analysis

Authenticated GET/POST `/api/local/history/enhancements/notes/:id` reads/saves a title and note with optimistic `revision` checking. Notes live in `notes/` and are removed with their mission. GET `/api/local/history/enhancements/export?mission=<explicit-id>&format=json|csv` exports whitelisted trajectory/annotation fields, never arbitrary robot configuration. CSV text is escaped to prevent spreadsheet formula evaluation. Statistics use uncalibrated coordinate units and skip segment breaks and long gaps; they do not measure cleaning coverage. Comparison overlays may be offset when missions use different position origins.

## Timestamp playback and mission library controls

The history map now restores server display preferences and provides timestamp-based playback, speed/seek controls, mission titles/notes, text/date/status filters, comparison snapshots, PNG/JSON/CSV exports and confirmed cleanup controls. Playback never changes the recording cursor. Battery/area remain mission summaries, not fabricated per-frame samples. Draft edits survive polling and switching missions within the current page; unsaved drafts do not survive reloads.

## Responsive map dashboard and navigation

The history page groups six summary cards, map/playback controls and task/history/settings tabs. Position and status follow playback and are labelled as historical when appropriate. The read-only Test button displays `/api/local/info/sys` in a modal. The map defaults to fitting its bounded viewport; buttons/wheel zoom up to 6×, left drag pans, and touch supports pinch zoom and one-finger pan. Use Fit viewport to reset. The page remains scrollable outside the map. Delete controls are in the History tab. The firmware 1/non-history page keeps its existing layout.
