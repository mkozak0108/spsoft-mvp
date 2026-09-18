// Reads the study identifier from the scoring app's own address. The value is
// untrusted: an invalid one is never carried in the result (research R8).
export type StudyLink =
  | { kind: 'valid'; studyInstanceUid: string }
  | { kind: 'missing' }
  | { kind: 'malformed' };

// DICOM UID: digits in dot-separated components, at most 64 characters.
// Leading zeros are tolerated because real archives contain them.
const UID_PATTERN = /^[0-9]+(\.[0-9]+)+$/;
const MAX_UID_LENGTH = 64;

export function parseStudyLink(search: string): StudyLink {
  const value = new URLSearchParams(search).get('StudyInstanceUIDs');
  if (!value) {
    return { kind: 'missing' };
  }
  if (value.length > MAX_UID_LENGTH || !UID_PATTERN.test(value)) {
    return { kind: 'malformed' };
  }
  return { kind: 'valid', studyInstanceUid: value };
}
