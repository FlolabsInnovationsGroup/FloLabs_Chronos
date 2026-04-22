export const BUILD_COMMIT_SHA = process.env.NEXT_PUBLIC_BUILD_COMMIT_SHA ?? process.env.BUILD_COMMIT_SHA ?? "unknown";
export const BUILD_COMMIT_REF = process.env.NEXT_PUBLIC_BUILD_COMMIT_REF ?? process.env.BUILD_COMMIT_REF ?? "unknown";
export const BUILD_IMAGE_TAG = process.env.NEXT_PUBLIC_BUILD_IMAGE_TAG ?? process.env.BUILD_IMAGE_TAG ?? "unknown";
export const BUILD_IMAGE_DIGEST = process.env.NEXT_PUBLIC_BUILD_IMAGE_DIGEST ?? process.env.BUILD_IMAGE_DIGEST ?? "unknown";
export const BUILD_TIMESTAMP = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? process.env.BUILD_TIMESTAMP ?? "unknown";

export function buildInfo() {
  return {
    commitSha: BUILD_COMMIT_SHA,
    commitRef: BUILD_COMMIT_REF,
    imageTag: BUILD_IMAGE_TAG,
    imageDigest: BUILD_IMAGE_DIGEST,
    buildTimestamp: BUILD_TIMESTAMP,
  };
}
