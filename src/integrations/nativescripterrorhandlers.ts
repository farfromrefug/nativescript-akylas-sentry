import { getCurrentHub } from '@sentry/core';
import { Integration, Severity } from '@sentry/types';
import { logger } from '@sentry/utils';

import { NativescriptClient } from '../client';

import * as application from '@nativescript/core/application';
import * as trace from '@nativescript/core/trace';

/** NativescriptErrorHandlers Options */
interface NativescriptErrorHandlersOptions {
    onerror: boolean;
    onunhandledrejection: boolean;
}

declare const global: any;

/** NativescriptErrorHandlers Integration */
export class NativescriptErrorHandlers implements Integration {
    /**
     * @inheritDoc
     */
    public name: string = NativescriptErrorHandlers.id;

    /**
     * @inheritDoc
     */
    public static id: string = 'NativescriptErrorHandlers';

    /** NativescriptOptions */
    private readonly _options: NativescriptErrorHandlersOptions;

    /** Constructor */
    public constructor(options?: NativescriptErrorHandlersOptions) {
        this._options = {
            onerror: true,
            onunhandledrejection: true,
            ...options
        };
    }

    /**
     * @inheritDoc
     */
    public setupOnce(): void {
        this._handleUnhandledRejections();
        this._handleOnError();
    }

    /**
     * Handle Promises
     */
    private _handleUnhandledRejections(): void {
        if (this._options.onunhandledrejection) {
            console.log('registering for uncaughtErrorEvent');
            application.on(application.uncaughtErrorEvent, this.globalHanderEvent, this);
            // const tracking = require('promise/setimmediate/rejection-tracking');
            // tracking.disable();
            // tracking.enable({
            //     allRejections: true,
            //     onHandled: () => {
            //         // We do nothing
            //     },
            //     onUnhandled: (id: any, error: any) => {
            //         getCurrentHub().captureException(error, {
            //             data: { id },
            //             originalException: error
            //         });
            //     }
            // });
        }
    }

    private globalHanderEvent(event) {
        this.globalHander(event.error);
    }
    private globalHander(error: any, isFatal?: boolean) {
        // error.stack = error.stackTrace;
        // We want to handle fatals, but only in production mode.

        // const stackTrace = error.stackTrace;
        // error.stackTrace = error.stack;
        // error.stack = stackTrace;
        // const shouldHandleFatal = isFatal && !global.__DEV__;
        // let handlingFatal = false;
        // if (shouldHandleFatal) {
        //     if (handlingFatal) {
        //         logger.log('Encountered multiple fatals in a row. The latest:', error);
        //         return;
        //     }
        //     handlingFatal = true;
        // }
        console.log('globalHander catched', error);

        getCurrentHub().withScope(scope => {
            if (isFatal) {
                scope.setLevel(Severity.Fatal);
            }
            getCurrentHub().captureException(error, {
                originalException: error
            });
        });

        const client = getCurrentHub().getClient<NativescriptClient>();
        // If in dev, we call the default handler anyway and hope the error will be sent
        // Just for a better dev experience
        if (client) {
            (client.flush(client.getOptions().shutdownTimeout || 2000) as any)
                .then(() => {
                    // defaultHandler(error, isFatal);
                })
                .catch(e => {
                    logger.error(e);
                });
        } else {
            // If there is no client something is fishy, anyway we call the default handler
            // defaultHandler(error, isFatal);
        }
    }

    /**
     * Handle erros
     */
    private _handleOnError(): void {
        if (this._options.onerror) {
            // let handlingFatal = false;
            console.log('registering for discardedErrorEvent');
            application.on(application.discardedErrorEvent, this.globalHanderEvent, this);

            console.log('setErrorHandler');
            trace.setErrorHandler({
                handlerError: this.globalHander
            });
            // const defaultHandler = ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler();

            // ErrorUtils.setGlobalHandler);
        }
    }
}