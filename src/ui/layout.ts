export interface ScrollMetrics {
  offset: number;
  max: number;
  thumbHeight: number;
  thumbOffset: number;
}

export function scrollMetrics(contentHeight: number, viewportHeight: number, requestedOffset: number): ScrollMetrics {
  const safeContent = Math.max(0, contentHeight);
  const safeViewport = Math.max(1, viewportHeight);
  const max = Math.max(0, safeContent - safeViewport);
  const offset = Math.max(0, Math.min(max, requestedOffset));
  const visibleRatio = max <= 0 ? 1 : safeViewport / safeContent;
  const thumbHeight = Math.max(36, Math.min(safeViewport, safeViewport * visibleRatio));
  const travel = Math.max(0, safeViewport - thumbHeight);
  const thumbOffset = max > 0 ? travel * offset / max : 0;
  return { offset, max, thumbHeight, thumbOffset };
}
