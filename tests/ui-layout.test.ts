import { describe, expect, it } from 'vitest';
import { dioramaDepth, dioramaScaleAtY, dioramaShadowAlpha, dioramaShadowOffset } from '../src/rendering/diorama';
import { scrollMetrics } from '../src/ui/layout';
import { fittedButtonFontSize, truncateText } from '../src/ui/typography';

describe('UI containment helpers', () => {
  it('preserves short dynamic labels without changing their content', () => {
    expect(truncateText('Finding the nearest Dew Loom', 48)).toBe('Finding the nearest Dew Loom');
  });

  it('truncates long AI reasoning at a word boundary with a visible ellipsis', () => {
    const result = truncateText('Finding a distant facility because every nearby station is reserved by a larger emergency queue and the preferred route is blocked', 72);
    expect(result.length).toBeLessThanOrEqual(72);
    expect(result.endsWith('…')).toBe(true);
    expect(result.includes('\n')).toBe(false);
  });

  it('keeps short guide pages stationary and clamps long-page scrolling', () => {
    expect(scrollMetrics(300, 500, 200)).toEqual({ offset: 0, max: 0, thumbHeight: 500, thumbOffset: 0 });
    const long = scrollMetrics(1500, 500, 2000);
    expect(long.offset).toBe(1000);
    expect(long.max).toBe(1000);
    expect(long.thumbHeight).toBeCloseTo(166.67, 1);
    expect(long.thumbOffset).toBeCloseTo(333.33, 1);
  });

  it('shrinks narrow button labels while preserving a readable floor', () => {
    expect(fittedButtonFontSize('START', 42)).toBeGreaterThanOrEqual(8);
    expect(fittedButtonFontSize('START', 42)).toBeLessThan(13);
    expect(fittedButtonFontSize('AUTO MAINTENANCE', 166)).toBe(13);
  });
});

describe('2.5D diorama presentation', () => {
  it('sorts lower world positions in front of higher positions', () => {
    expect(dioramaDepth(800)).toBeGreaterThan(dioramaDepth(300));
    expect(dioramaDepth(500, 0.5)).toBeGreaterThan(dioramaDepth(500));
  });

  it('casts directional shadows that change across the day', () => {
    const morning = dioramaShadowOffset(0.2, 60);
    const evening = dioramaShadowOffset(0.8, 60);
    expect(morning.x).toBeLessThan(0);
    expect(evening.x).toBeGreaterThan(0);
    expect(morning.y).toBeGreaterThan(0);
  });

  it('keeps foreground actors subtly larger and storms softly lit', () => {
    expect(dioramaScaleAtY(900)).toBeGreaterThan(dioramaScaleAtY(100));
    expect(dioramaShadowAlpha(0.5, 'storm')).toBeLessThan(dioramaShadowAlpha(0.5, 'clear'));
  });
});
