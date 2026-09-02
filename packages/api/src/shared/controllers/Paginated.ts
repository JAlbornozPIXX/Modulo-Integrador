import { Page } from '@/shared/contracts/params';
import { PageMeta } from '@app/contracts/shared/http';

export default class Paginated<T>{
    constructor(readonly items: T[], readonly page: Page, readonly total: number){}

    get meta(): PageMeta{
        return { total: this.total, limit: this.page.limit, offset: this.page.offset };
    }
}
