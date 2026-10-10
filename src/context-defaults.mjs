/** Context settings shared by Host policy and browser configuration. */
export const DEFAULT_CONTEXT_POLICY = Object.freeze({ enabled: true, headroomRatio: 0.06,
  thresholdRatio: 0.8, targetRatio: 0.4, retainRatio: 0.16,
  maxSnapshotCharacters: 12000, catalogDescriptionCharacters: 96, previewItems: 3, detailPageCharacters: 4096 });
