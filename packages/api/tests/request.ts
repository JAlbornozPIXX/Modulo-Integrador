import { expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Endpoint, HttpMethod } from '@app/contracts/shared/routing';

type QueryParams = Record<string, number | string>;

export interface RequestOptions<I>{
    body?: I;
    params?: QueryParams;
    query?: QueryParams;
}

export interface TestResponse<O>{
    status: number;
    body: string;
    json: <T = Record<string, unknown>>() => T;
    data: () => O;
}

const withParams = (path: string, params: QueryParams): string => {
    let url = path;
    for(const [name, value] of Object.entries(params)){
        url = url.replace(`:${name}`, String(value));
    }
    return url;
};

const withQuery = (url: string, query?: QueryParams): string => {
    if(!query) return url;

    const search = new URLSearchParams();
    for(const [key, value] of Object.entries(query)){
        search.set(key, String(value));
    }
    return `${url}?${search}`;
};

export const request = async <I, O>(
    app: FastifyInstance,
    endpoint: Endpoint<I, O>,
    { body, params = {}, query }: RequestOptions<I> = {}
): Promise<TestResponse<O>> => {
    const res = await app.inject({
        method: endpoint.method,
        url: withQuery(withParams(endpoint.path, params), query),
        payload: body as object | undefined
    });

    return {
        status: res.statusCode,
        body: res.body,
        json: <T>() => res.json() as T,
        data: () => (res.json() as { data: O }).data
    };
};

export const route = (method: HttpMethod, path: string): Endpoint<unknown, unknown> => ({ method, path });

export const expectError = (res: TestResponse<unknown>, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(res.json()).toMatchObject({ error: code });
};
