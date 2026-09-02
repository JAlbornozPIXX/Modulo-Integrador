import RuntimeError from '@app/core/RuntimeError';
import { RequestError } from '@/shared/errors/RequestError';

export default class ValidationError extends RuntimeError{
    constructor(readonly errors: Record<string, string>, template: RuntimeError = RequestError.ValidationFailed()){
        super(template.message, template.statusCode);
    }
}
