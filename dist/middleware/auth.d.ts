import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth';
export declare const authenticateToken: (req: AuthRequest, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=auth.d.ts.map