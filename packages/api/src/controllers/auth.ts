import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { User } from "../models/user";
import * as bcrypt from "bcrypt";

export const signUp = async (req: Request, res: Response) => {
    const { email, password } = req.body
    const user = AppDataSource.getRepository(User).create({ email, password });
    user.password = await bcrypt.hash(password, 10);
    const saved = await AppDataSource.getRepository(User).save(user);
    delete saved.password;
    res.status(201).json(saved);
};

export const signIn = async (req: Request, res: Response) => {
    res.json({ status: 'success' });
};