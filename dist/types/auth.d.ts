import { Request } from 'express';
export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    emailVerified: boolean;
    createdAt: Date;
}
export interface AuthRequest extends Request {
    user?: User;
    id?: string;
}
declare global {
    namespace Express {
        interface Request {
            id?: string;
        }
    }
}
//# sourceMappingURL=auth.d.ts.map