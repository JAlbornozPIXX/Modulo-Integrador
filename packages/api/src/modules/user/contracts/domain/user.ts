import type { UserProfile } from "@app/contracts/modules/user/domain";
import type { BaseFields } from "@/shared/contracts/base";

export interface UserFields extends UserProfile{
    passwordHash: string | null;
}

export type PublicUser = UserProfile & BaseFields;