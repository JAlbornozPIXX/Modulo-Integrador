import ValidationError from '@/shared/errors/ValidationError';
import type { IValidation } from 'typia';
import type { BodyValidator } from '@/shared/contracts/params';

const messageFor = ({ expected, value }: IValidation.IError): string => {
    const length = typeof value === 'string' ? value.length : null;

    const min = expected.match(/MinLength<(\d+)>/);
    if(min && length !== null && length < Number(min[1])){
        return min[1] === '1' ? 'Required' : `At least ${min[1]} characters`;
    }

    const max = expected.match(/MaxLength<(\d+)>/);
    if(max && length !== null && length > Number(max[1])){
        return `At most ${max[1]} characters`;
    }

    if(expected.includes('Format<"email">')) return 'Invalid email';
    if(value === undefined) return 'Required';
    return `Expected ${expected}`;
};

const fieldKeyOf = (path: string): string =>
    path === '$input' ? 'body' : path.replace(/^\$input\./, '').split(/[.[]/)[0];

export const parseBody = <T>(validate: BodyValidator<T>, body: unknown): T => {
    const result = validate(body);
    if(result.success) return result.data;

    const errors: Record<string, string> = {};
    for(const error of result.errors){
        const key = fieldKeyOf(error.path);
        if(!(key in errors)) errors[key] = messageFor(error);
    }
    throw new ValidationError(errors);
};
