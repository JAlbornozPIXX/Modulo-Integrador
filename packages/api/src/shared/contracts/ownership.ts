export interface OwnedResolver<T>{
    getOwned(userId: string, id: string): Promise<T>;
}
