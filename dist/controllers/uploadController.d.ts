import { Request, Response } from 'express';
import multer from 'multer';
export declare const upload: multer.Multer;
export declare const uploadReceipt: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const deleteReceipt: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const getReceiptInfo: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const bulkDeleteReceipts: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const getReceiptStats: (req: Request, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=uploadController.d.ts.map