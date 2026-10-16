import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DoorSymbol } from './DoorSymbol';

describe('DoorSymbol', () => {
  it('shows a door swing for doors and an empty threshold for passages', () => {
    const door = renderToStaticMarkup(<DoorSymbol width={72} height={11} strokeWidth={1.6} />);
    const passage = renderToStaticMarkup(
      <DoorSymbol width={72} height={11} strokeWidth={1.6} style="passage" />,
    );
    expect(door).toContain('data-kind="wall-opening"');
    expect(door).toContain('<path');
    expect(passage).not.toContain('<path');
    expect(passage).toContain('<line');
    const inward = renderToStaticMarkup(
      <DoorSymbol width={72} height={11} strokeWidth={1.6} swingSide={1} />,
    );
    expect(inward).toContain(' 0 0 1 ');
    expect(door).toContain(' 0 0 0 ');
  });
});
