export interface UpdateState { lastCheckAt: number | null; availableVersion?: string; stagedPath?: string; stagedSha256?: string; verified: boolean; }
export function initialUpdateState(): UpdateState { return { lastCheckAt: null, verified: false }; }
