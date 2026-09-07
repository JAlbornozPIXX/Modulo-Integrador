import "reflect-metadata";
import express from 'express';
import bodyParser from 'body-parser';
import { AppDataSource } from "./data-source";
import authRouter from './routes/auth';

const app = express();
const PORT = 4000;

app.use(bodyParser.json());

app.use('/auth/', authRouter);

const main = async () => {
    await AppDataSource.initialize();
    app.listen(PORT, () => {
        console.log(`API escuchando en http://localhost:${PORT}`);
    });
};

main();