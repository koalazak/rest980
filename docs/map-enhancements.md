# Map history enhancements

These features require the optional firmware 2 background history recorder. Mount the configured history directory for persistence. All new endpoints inherit existing API authentication.

## Persistent display preferences and recorder diagnostics

With `mapHistoryDirectory` enabled, `/api/local/history/enhancements` exposes supported features and saved display settings. Settings use `settings.json` in the history directory and retain validated legacy canvas values on first use. Authenticated GET/POST `/api/local/history/enhancements/settings` reads/saves canvas size, offsets, refresh interval and trajectory fit. Mission summaries retain robot-reported maxima; recorder status distinguishes transport, state reception, coordinates and successful writes. Coordinates are not calibrated to metres. No new robot connection is opened.
