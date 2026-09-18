import { describe, expect, it } from 'vitest';
import { parseStudyLink } from './studyLink';

const UID_64 = `1.${'2'.repeat(62)}`;
const UID_65 = `1.${'2'.repeat(63)}`;

describe('parseStudyLink', () => {
  it('has fixtures of the intended lengths', () => {
    expect(UID_64).toHaveLength(64);
    expect(UID_65).toHaveLength(65);
  });

  it.each([
    '1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5',
    '1.2.840.113619.2.30.1.1762295590.1623.978668949.886',
    '1.2.3.4.5.6.7.8.9',
    '1.02.3',
    UID_64,
  ])('accepts %s', (uid) => {
    expect(parseStudyLink(`?StudyInstanceUIDs=${uid}`)).toStrictEqual({
      kind: 'valid',
      studyInstanceUid: uid,
    });
  });

  it.each(['', '?', '?StudyInstanceUIDs=', '?other=1'])(
    'reports %j as missing',
    (search) => {
      expect(parseStudyLink(search)).toStrictEqual({ kind: 'missing' });
    },
  );

  it.each([
    ['letters', 'abc'],
    ['a single component', '123'],
    ['a trailing dot', '1.2.'],
    ['a leading dot', '.1.2'],
    ['a comma-separated list', '1.2.3,4.5.6'],
    ['embedded whitespace', '1.2.3%204.5'],
    ['leading whitespace', '%201.2.3'],
    ['more than 64 characters', UID_65],
  ])('reports %s as malformed, without the raw value', (_case, value) => {
    expect(parseStudyLink(`?StudyInstanceUIDs=${value}`)).toStrictEqual({
      kind: 'malformed',
    });
  });
});
