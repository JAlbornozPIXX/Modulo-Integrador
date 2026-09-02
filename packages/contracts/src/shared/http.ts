export interface PageMeta{
    total: number;
    limit: number;
    offset: number;
}

export interface PageOf<T>{
    items: T[];
    meta: PageMeta;
}

export interface ApiResponse<T>{
    data: T;
    meta?: PageMeta;
}

export interface ApiError{
    error: string;
    errors?: Record<string, string>;
}
