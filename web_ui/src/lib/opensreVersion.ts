export type OpensreVersionInfo = {
  version: string;
  gitSha: string | null;
};

export function readOpensreVersion(
  env: NodeJS.Dict<string> = process.env,
): OpensreVersionInfo {
  const rawVersion = (env.OPENSRE_VERSION ?? '').trim();
  const rawSha = (env.OPENSRE_GIT_SHA ?? '').trim();
  return {
    version: rawVersion || 'dev',
    gitSha: rawSha || null,
  };
}
