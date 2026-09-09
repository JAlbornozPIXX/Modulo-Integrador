import { ErrorTable } from "../../shared/errors";
import { ErrorCode } from "../../shared/errors";

export const AuthErrors = {
    domain: 'Auth',
    causes: {
        Unauthorized: 401,
        InvalidToken: 401,
        InvalidCredentials: 401,
        EmailAlreadyRegistered: 409
    }
} as const satisfies ErrorTable;

export type AuthErrorCode = ErrorCode<typeof AuthErrors>;
