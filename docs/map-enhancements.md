# Map history enhancements

These features require the optional firmware 2 background history recorder. Mount the configured history directory for persistence. All new endpoints inherit existing API authentication.

## Persistent display preferences and recorder diagnostics

With `mapHistoryDirectory` enabled, `/api/local/history/enhancements` exposes supported features and saved display settings. Settings use `settings.json` in the history directory and retain validated legacy canvas values on first use. Authenticated GET/POST `/api/local/history/enhancements/settings` reads/saves canvas size, offsets, refresh interval and trajectory fit. Mission summaries retain robot-reported maxima; recorder status distinguishes transport, state reception, coordinates and successful writes. Coordinates are not calibrated to metres. No new robot connection is opened.

## Confirmed batch deletion and opt-in retention

GET `/api/local/history/enhancements/retention` reads policy/status. POST `retention/plan` accepts explicit `ids` (1–200) or a `policy` object with `enabled`, `maxCount` and `maxDays`. Preview returns a five-minute, single-use token and an exact target list. POST `retention/apply` with `{ "token": "..." }` revalidates the snapshot before deleting. Automatic cleanup is off by default. Zero disables a limit; either exceeded positive limit qualifies. Active/recharging missions remain protected. Policies persist in `retention.json`. Each scheduled run deletes at most 200 missions. Deleted maps cannot be recovered.

## Mission notes, exports and trajectory analysis

Authenticated GET/POST `/api/local/history/enhancements/notes/:id` reads/saves a title and note with optimistic `revision` checking. Notes live in `notes/` and are removed with their mission. GET `/api/local/history/enhancements/export?mission=<explicit-id>&format=json|csv` exports whitelisted trajectory/annotation fields, never arbitrary robot configuration. CSV text is escaped to prevent spreadsheet formula evaluation. Statistics use uncalibrated coordinate units and skip segment breaks and long gaps; they do not measure cleaning coverage. Comparison overlays may be offset when missions use different position origins.
