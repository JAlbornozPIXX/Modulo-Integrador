import type { tags } from 'typia';

export interface SignUpInput{
    email: string & tags.Format<'email'>;
    password: string & tags.MinLength<8>;
}

export interface SignInInput{
    email: string & tags.Format<'email'>;
    password: string & tags.MinLength<8>;
}