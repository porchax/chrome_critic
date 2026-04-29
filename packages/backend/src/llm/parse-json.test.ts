import { describe, expect, it } from 'vitest';
import { parseJsonResponse } from './parse-json';

describe('parseJsonResponse', () => {
  it('parses plain JSON object', () => {
    expect(parseJsonResponse('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips ```json ... ``` markdown fence', () => {
    const wrapped = '```json\n{"a":1}\n```';
    expect(parseJsonResponse(wrapped)).toEqual({ a: 1 });
  });

  it('strips bare ``` ... ``` fence without language tag', () => {
    const wrapped = '```\n{"a":1}\n```';
    expect(parseJsonResponse(wrapped)).toEqual({ a: 1 });
  });

  it('tolerates surrounding whitespace around fence', () => {
    const wrapped = '   ```json\n{"a":1}\n```   ';
    expect(parseJsonResponse(wrapped)).toEqual({ a: 1 });
  });

  it('throws on truly invalid JSON', () => {
    expect(() => parseJsonResponse('not json at all')).toThrow();
  });
});
