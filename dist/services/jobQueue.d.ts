export declare const jobQueue: {
    add: (jobType: string, data: any, options?: any) => Promise<{
        id: string;
        expenseId: any;
        categoryId: string;
        confidence: number;
    } | {
        success: boolean;
    } | {
        skipped: boolean;
        success?: undefined;
    } | {
        processed: number;
        updated: number;
        failed: number;
        skipped: boolean;
    } | null>;
};
export declare const aiQueue: {
    on: (event: string, callback: Function) => void;
    process: (jobName: string, concurrency: number, processor: Function) => void;
    isReady: () => Promise<boolean>;
    close: () => Promise<void>;
};
export declare const emailQueue: {
    on: (event: string, callback: Function) => void;
    process: (jobName: string, concurrency: number, processor: Function) => void;
    close: () => Promise<void>;
};
export declare const reportQueue: {
    on: (event: string, callback: Function) => void;
    process: (jobName: string, concurrency: number, processor: Function) => void;
    close: () => Promise<void>;
};
export declare function getQueueStats(): Promise<{
    ai: {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    };
    email: {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    };
    report: {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    };
    redisConnected: boolean;
    mode: string;
}>;
export declare function closeQueues(): Promise<void>;
//# sourceMappingURL=jobQueue.d.ts.map