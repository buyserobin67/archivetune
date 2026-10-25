import { describe, expect, it } from 'vitest';
import { bottomInsetWhenFilled, fillHeight, screenHeightNow, type ViewportFacts } from './viewport';

// iPhone 17-sized screen (402x874). The Home Screen app is reported ~62pt shorter in the bug.
const base: ViewportFacts = { standalone: true, innerWidth: 402, innerHeight: 812, visualHeight: 812, screenWidth: 402, screenHeight: 874, typing: false };

describe('fill the screen in the Home Screen app', () => {
  it('stretches to the screen when the viewport is significantly shorter', () => {
    expect(fillHeight(base)).toBe(874);
  });
  it('leaves Safari tabs alone, whatever the numbers', () => {
    expect(fillHeight({ ...base, standalone: false })).toBeNull();
  });
  it('leaves a correct Home Screen viewport alone', () => {
    expect(fillHeight({ ...base, innerHeight: 874, visualHeight: 874 })).toBeNull();
    expect(fillHeight({ ...base, innerHeight: 860, visualHeight: 860 })).toBeNull(); // rounding-sized gap
  });
  it('does not mistake the keyboard for the bug', () => {
    expect(fillHeight({ ...base, innerHeight: 520, visualHeight: 520, typing: true })).toBeNull();
    expect(fillHeight({ ...base, innerHeight: 520, visualHeight: 520 })).toBeNull(); // far too short to be this bug
  });
  it('uses the larger of layout and visual viewport', () => {
    expect(fillHeight({ ...base, innerHeight: 800, visualHeight: 860 })).toBeNull();
  });
  it('handles landscape: iOS keeps reporting portrait screen numbers', () => {
    const land = { ...base, innerWidth: 874, innerHeight: 350, visualHeight: 350 };
    expect(screenHeightNow(land)).toBe(402);
    expect(fillHeight(land)).toBe(402); // 52pt short in landscape: fills
    expect(fillHeight({ ...land, innerHeight: 402, visualHeight: 402 })).toBeNull();
  });
  it('keeps the home indicator clear when filling', () => {
    expect(bottomInsetWhenFilled(0, 874)).toBe(34);
    expect(bottomInsetWhenFilled(34, 874)).toBe(34);
    expect(bottomInsetWhenFilled(40, 874)).toBe(40);
    expect(bottomInsetWhenFilled(0, 667)).toBe(0); // home-button iPhones have no indicator
  });
});
