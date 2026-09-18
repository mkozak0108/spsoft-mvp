import { STUDY_UIDS_PARAM } from '@bridge-contract';

export enum StudyLinkKind {
  Valid = 'valid',
  Missing = 'missing',
  Malformed = 'malformed',
}

// Malformed carries no value: the raw query string is untrusted and must never be echoed.
export type StudyLink =
  | { kind: StudyLinkKind.Valid; studyInstanceUid: string }
  | { kind: StudyLinkKind.Missing }
  | { kind: StudyLinkKind.Malformed };

// DICOM PS3.5 UID syntax, except that leading zeros inside a component are tolerated because
// real archives contain them.
const UID_PATTERN = /^[0-9]+(\.[0-9]+)+$/;
const MAX_UID_LENGTH = 64;

export function parseStudyLink(search: string): StudyLink {
  const value = new URLSearchParams(search).get(STUDY_UIDS_PARAM);
  if (!value) {
    return { kind: StudyLinkKind.Missing };
  }
  if (value.length > MAX_UID_LENGTH || !UID_PATTERN.test(value)) {
    return { kind: StudyLinkKind.Malformed };
  }
  return { kind: StudyLinkKind.Valid, studyInstanceUid: value };
}
