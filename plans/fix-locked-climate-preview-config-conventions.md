# Align locked climate preview config with module conventions

`src/ui/hooks/useLockedClimatePreview.ts` declares `LockedClimatePreviewConfig` inline rather than in a concrete `types.ts`, and its optional `seismologyTotalHeatingK` property lacks the required nearby `[JUSTIFICATION]` comment.

Move the config shape to a concrete `types.ts` module and document why the heating value is optional when the hook is next refactored.
