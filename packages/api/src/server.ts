import 'reflect-metadata';
import 'dotenv/config';

import Application from '@/core/Application';
import { logger } from '@/shared/utils/Logger';

const app = new Application();

app.start().catch((err) => {
    logger.error('Failed to start server', err);
    process.exit(1);
});

for(const signal of ['SIGTERM', 'SIGINT'] as const){
    process.on(signal, () => {
        app.stop().finally(() => process.exit(0));
    });
}
