import ValidationError from '@/shared/errors/ValidationError';

const UPPERCASE = /[A-Z]/;
const DIGIT = /\d/;
const MESSAGE = 'Debe tener al menos 8 caracteres, incluyendo 1 mayúscula y 1 número.';

export const assertPasswordPolicy = (password: string): void => {
    if(UPPERCASE.test(password) && DIGIT.test(password)) return;

    throw new ValidationError({ password: MESSAGE });
}