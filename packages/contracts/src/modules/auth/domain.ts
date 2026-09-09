import type { BaseEntity } from "../../shared/base";
import type { UserProfile } from "../user/domain";

export interface AuthSession{
    token: string;
    user: UserProfile & BaseEntity;
}

