import { describe, expect, it } from 'vitest';
import { readOpensreVersion } from './opensreVersion';

describe('readOpensreVersion', () => {
  it('returns OPENSRE_VERSION and OPENSRE_GIT_SHA when set', () => {
    expect(
      readOpensreVersion({
        OPENSRE_VERSION: '1.2.6',
        OPENSRE_GIT_SHA: 'abc1234',
      }),
    ).toEqual({ version: '1.2.6', gitSha: 'abc1234' });
  });

  it('falls back to dev when version unset or blank', () => {
    expect(readOpensreVersion({})).toEqual({ version: 'dev', gitSha: null });
    expect(readOpensreVersion({ OPENSRE_VERSION: '  ' })).toEqual({
      version: 'dev',
      gitSha: null,
    });
  });

  it('returns null gitSha when SHA unset or blank', () => {
    expect(readOpensreVersion({ OPENSRE_VERSION: '1.2.6' }).gitSha).toBeNull();
    expect(
      readOpensreVersion({ OPENSRE_VERSION: '1.2.6', OPENSRE_GIT_SHA: '' }).gitSha,
    ).toBeNull();
  });

  it('trims whitespace', () => {
    expect(
      readOpensreVersion({
        OPENSRE_VERSION: ' 1.2.6 ',
        OPENSRE_GIT_SHA: ' abc1234 ',
      }),
    ).toEqual({ version: '1.2.6', gitSha: 'abc1234' });
  });
});
