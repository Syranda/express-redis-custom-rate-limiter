import { Request, Response, NextFunction } from "express";
import { createClient } from "redis";

const defaultOptions = {
    timeWindow: 5,
    maxRequests: 10,
    identifier: (req: Request): string => req.ip,
    denyUndefinedIdentifier: true,
    logger: console.log,
    enableLogging: false,
};

function rateLimit(
    redisClient: ReturnType<typeof createClient>,
    options: Partial<typeof defaultOptions> = defaultOptions
) {
    const timeWindow =
        options.timeWindow || defaultOptions.timeWindow;
    const maxRequests =
        options.maxRequests || defaultOptions.maxRequests;
    const identifier =
        options.identifier || defaultOptions.identifier;

    const logger = options.logger || defaultOptions.logger;
    const enableLogging =
        options.enableLogging || defaultOptions.enableLogging;

    const denyUndefinedIdentifier =
        options.denyUndefinedIdentifier ||
        defaultOptions.denyUndefinedIdentifier;

    return async (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        const clientId = identifier(req);

        if (clientId === undefined) {
            if (denyUndefinedIdentifier) {
                res.sendStatus(403);
                return;
            }
            next();
            return;
        }

        const time = new Date().getTime();

        await redisClient
            .multi()
            .zRemRangeByScore(
                clientId,
                "-inf",
                new Date().getTime() - timeWindow * 1000
            )
            .zAdd(clientId, {
                score: time,
                value: time.toString(),
            })
            .exec();

        const rate = await redisClient.zCard(clientId);

        if (rate > maxRequests) {
            if (enableLogging) {
                logger(
                    `Client id ${clientId} has passed the rate limit (${maxRequests})`
                );
            }
            res.sendStatus(429);
            return;
        }

        next();
    };
}

export default rateLimit;
