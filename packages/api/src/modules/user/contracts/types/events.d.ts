declare global{
    interface EventMap{
        'user.created': { userId: string; email: string };
    }
}

export {};
