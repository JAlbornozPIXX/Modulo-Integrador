import { createParamDecorator } from './params';
import { parseBody } from './parseBody';
import { parseId } from './parseId';
import { parseOrdinal } from './parseOrdinal';
import { parsePagination } from './parsePagination';
import { RequestError } from '@/shared/errors/RequestError';
import type { BodyValidator, PaginationOptions } from '@/shared/contracts/params';
import type { UploadedFile as UploadedFilePayload } from '@/shared/contracts/upload';

export const Body = <T>(validate?: BodyValidator<T>): ParameterDecorator =>
    createParamDecorator((req) => validate ? parseBody(validate, req.body) : req.body);

export const IdParam = (name: string): ParameterDecorator =>
    createParamDecorator((req) => parseId((req.params as Record<string, string>)[name]));

export const OrdinalParam = (name: string): ParameterDecorator =>
    createParamDecorator((req) => parseOrdinal((req.params as Record<string, string>)[name]));

export const Param = (name: string): ParameterDecorator =>
    createParamDecorator((req) => (req.params as Record<string, string>)[name]);

export const Query = (name?: string): ParameterDecorator =>
    createParamDecorator((req) =>
        name === undefined ? req.query : (req.query as Record<string, string>)[name]);

export const IdQuery = (name: string): ParameterDecorator =>
    createParamDecorator((req) => parseId((req.query as Record<string, string>)[name]));

export const Pagination = (options?: PaginationOptions): ParameterDecorator =>
    createParamDecorator((req) => parsePagination(req.query, options));

export const UploadedFile = (): ParameterDecorator =>
    createParamDecorator(async (req): Promise<UploadedFilePayload> => {
        const part = await req.file();
        if(!part) throw RequestError.FileMissing();

        try{
            const buffer = await part.toBuffer();
            return { filename: part.filename, buffer };
        }catch(error){
            if(error instanceof Error && (error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE'){
                throw RequestError.FileTooLarge();
            }
            throw error;
        }
    });
