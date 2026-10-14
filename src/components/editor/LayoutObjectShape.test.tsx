import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LayoutObject } from '../../types/layout';
import { LayoutObjectShape } from './LayoutObjectShape';

describe('LayoutObjectShape', () => {
  it.each(['rectangle', 'circle', 'triangle'] as const)(
    'renders the selected %s color in the set builder and editor',
    (shape) => {
      const object: LayoutObject = {
        id: 'object-1',
        floorId: 'floor-1',
        category: 'furniture',
        type: 'custom',
        name: 'custom',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        color: '#E48A98',
        shape,
        rotation: 0,
        locked: false,
      };
      const markup = renderToStaticMarkup(
        <svg>
          <LayoutObjectShape object={object} viewport={{ x: 0, y: 0, scale: 70 }} />
        </svg>,
      );

      expect(markup).toContain('style="color:#E48A98"');
      expect(markup).toContain('fill="currentColor"');
    },
  );
});
