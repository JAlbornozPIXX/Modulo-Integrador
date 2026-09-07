import { Router } from 'express';
import { signIn, signUp } from '../controllers/auth';

const router = Router();

router.post('/sign-up', signUp);
router.post('/sign-in', signIn);

export default router;