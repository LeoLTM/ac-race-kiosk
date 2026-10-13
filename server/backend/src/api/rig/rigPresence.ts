import { env } from "@/common/utils/envConfig";

// A rig is online while its AC app keeps sending heartbeats
export function isRigOnline(rig: { lastSeenAt: Date | null }, now: Date): boolean {
	return rig.lastSeenAt !== null && now.getTime() - rig.lastSeenAt.getTime() <= env.RIG_OFFLINE_AFTER_SEC * 1000;
}
