import { AuthErrors } from '@app/contracts/modules/auth/errors';
import { defineErrors } from '@app/core/defineErrors';

export const AuthError = defineErrors(AuthErrors);
