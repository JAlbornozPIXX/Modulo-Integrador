import { User } from "./models/user";
import { DataSource } from "typeorm";

export const AppDataSource = new DataSource({
    type: "better-sqlite3",
    database: "dev.db",
    entities: [User],
    synchronize: true
});