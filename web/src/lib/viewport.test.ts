import { describe, expect, it } from 'vitest';
import { screenHeightNow } from './viewport';

describe('screenHeightNow', () => {
  const f = { innerWidth: 402, innerHeight: 812, screenWidth: 402, screenHeight: 874 };
  it('uses the long side in portrait and the short side in landscape (iOS never swaps screen.width/height)', () => {
    expect(screenHeightNow(f)).toBe(874);
    expect(screenHeightNow({ ...f, innerWidth: 874, innerHeight: 350 })).toBe(402);
  });
});
