import {
    RequestInstrumentationOptions,
    defaultRequestInstrumentationOptions,
    registerRequestInstrumentation,
    startIdleTransaction,
} from '@sentry/tracing';
import {
    EventProcessor,
    Hub,
    Integration,
    TransactionContext,
    Transaction as TransactionType,
} from '@sentry/types';
import { logger } from '@sentry/utils';

// import { RoutingInstrumentationInstance } from '../tracing/routingInstrumentation';
import { adjustTransactionDuration } from './utils';

export interface NSTracingOptions
    extends RequestInstrumentationOptions {
    /**
     * The time to wait in ms until the transaction will be finished. The transaction will use the end timestamp of
     * the last finished span as the endtime for the transaction.
     * Time is in ms.
     *
     * Default: 1000
     */
    idleTimeout: number;

    /**
     * The maximum duration of a transaction before it will be marked as "deadline_exceeded".
     * If you never want to mark a transaction set it to 0.
     * Time is in seconds.
     *
     * Default: 600
     */
    maxTransactionDuration: number;

    /**
     * The routing instrumentation to be used with the tracing integration.
     * There is no routing instrumentation if nothing is passed.
     */
    // routingInstrumentation?: RoutingInstrumentationInstance;

    /**
     * Does not sample transactions that are from routes that have been seen any more and don't have any spans.
     * This removes a lot of the clutter as most back navigation transactions are now ignored.
     *
     * Default: true
     */
    ignoreEmptyBackNavigationTransactions?: boolean;

    /**
     * beforeNavigate is called before a navigation transaction is created and allows users to modify transaction
     * context data, or drop the transaction entirely (by setting `sampled = false` in the context).
     *
     * @param context: The context data which will be passed to `startTransaction` by default
     *
     * @returns A (potentially) modified context object, with `sampled = false` if the transaction should be dropped.
     */
    beforeNavigate?(context: TransactionContext): TransactionContext;
}

const defaultNSTracingOptions: NSTracingOptions = {
    ...defaultRequestInstrumentationOptions,
    idleTimeout: 1000,
    maxTransactionDuration: 600,
    ignoreEmptyBackNavigationTransactions: true,
};

/**
   * Tracing integration for React Native.
   */
export class NSTracing implements Integration {
    /**
     * @inheritDoc
     */
    public static id: string = 'NSTracing';
    /**
     * @inheritDoc
     */
    public name: string = NSTracing.id;

    /** NSTracing options */
    public options: NSTracingOptions;

    private _getCurrentHub?: () => Hub;

    constructor(options: Partial<NSTracingOptions> = {}) {
        this.options = {
            ...defaultNSTracingOptions,
            ...options,
        };
    }

    /**
     *  Registers routing and request instrumentation.
     */
    public setupOnce(
        // @ts-ignore TODO
        addGlobalEventProcessor: (callback: EventProcessor) => void,
        getCurrentHub: () => Hub
    ): void {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const {
            traceFetch,
            traceXHR,
            tracingOrigins,
            // @ts-ignore TODO
            shouldCreateSpanForRequest,
            // routingInstrumentation,
        } = this.options;

        this._getCurrentHub = getCurrentHub;

        // routingInstrumentation?.registerRoutingInstrumentation(
        //     this._onRouteWillChange.bind(this)
        // );

        // if (!routingInstrumentation) {
        //     logger.log(
        //         '[NSTracing] Not instrumenting route changes as routingInstrumentation has not been set.'
        //     );
        // }

        registerRequestInstrumentation({
            traceFetch,
            traceXHR,
            tracingOrigins,
            shouldCreateSpanForRequest,
        });

        addGlobalEventProcessor((event) => {
        // eslint-disable-next-line no-empty
            if (event.type === 'transaction') {
            }

            return event;
        });
    }

    /** To be called when the route changes, but BEFORE the components of the new route mount. */
    private _onRouteWillChange(
        context: TransactionContext
    ): TransactionType | undefined {
        // TODO: Consider more features on route change, one example is setting a tag of what route the user is on
        return this._createRouteTransaction(context);
    }

    /** Create routing idle transaction. */
    private _createRouteTransaction(
        context: TransactionContext
    ): TransactionType | undefined {
        if (!this._getCurrentHub) {
            logger.warn(
                `[NSTracing] Did not create ${context.op} transaction because _getCurrentHub is invalid.`
            );
            return undefined;
        }

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const {
            beforeNavigate,
            idleTimeout,
            maxTransactionDuration,
        } = this.options;

        const expandedContext = {
            ...context,
            trimEnd: true,
        };

        const modifiedContext =
        typeof beforeNavigate === 'function'
            ? beforeNavigate(expandedContext)
            : expandedContext;

        if (modifiedContext.sampled === false) {
            logger.log(
                `[NSTracing] Will not send ${context.op} transaction.`
            );
        }

        const hub = this._getCurrentHub();
        const idleTransaction = startIdleTransaction(
            hub as any,
            context,
            idleTimeout,
            true
        );
        logger.log(
            `[NSTracing] Starting ${context.op} transaction on scope`
        );
        idleTransaction.registerBeforeFinishCallback(
            (transaction, endTimestamp) => {
                adjustTransactionDuration(
                    maxTransactionDuration,
                    transaction,
                    endTimestamp
                );
            }
        );

        if (this.options.ignoreEmptyBackNavigationTransactions) {
            idleTransaction.registerBeforeFinishCallback((transaction) => {
                if (
                    transaction.data['routing.route.hasBeenSeen'] &&
            (!transaction.spanRecorder ||
              transaction.spanRecorder.spans.filter(
                  (span) => span.spanId !== transaction.spanId
              ).length === 0)
                ) {
                    // Route has been seen before and has no child spans.
                    transaction.sampled = false;
                }
            });
        }

        return idleTransaction as TransactionType;
    }
}
