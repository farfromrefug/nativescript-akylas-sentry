import { Integrations, defaultIntegrations, getCurrentHub } from '@sentry/browser';
import { initAndBind, setExtra } from '@sentry/core';
import { RewriteFrames } from '@sentry/integrations';
import { StackFrame } from '@sentry/types';

import { NativescriptOptions } from './backend';
import { NativescriptClient } from './client';
import { DebugSymbolicator, DeviceContext, NativescriptErrorHandlers, Release } from './integrations';

const IGNORED_DEFAULT_INTEGRATIONS = [
    'GlobalHandlers', // We will use the react-native internal handlers
    'Breadcrumbs', // We add it later, just not patching fetch
    'CaptureConsole', // We add it later, just not patching fetch
    'TryCatch', // We don't need this
];

export let rewriteFrameIntegration: {
    _iteratee: (frame: StackFrame) => StackFrame;
};
/**
 * Inits the SDK
 */
export function init(
    options: NativescriptOptions = {
        enableNative: true,
        enableNativeCrashHandling: true,
    }
): void {
    // tslint:disable: strict-comparisons
    console.log('init');
    if (options.defaultIntegrations === undefined) {
        rewriteFrameIntegration = new RewriteFrames({
            iteratee: (frame: StackFrame) => {
                if (frame.filename) {
                    let filename = (frame.filename = frame.filename
                        .replace(/^file\:\/\//, '')
                        .replace(/^address at /, '')
                        .replace(/^.*\/[^\.]+(\.app|CodePush|.*(?=\/))/, ''));

                    // const appPrefix = 'app://';
                    if (frame.filename.indexOf('[native code]') === -1) {
                        const appPrefix = options.appPrefix || '';
                        if (appPrefix.endsWith('//') && !appPrefix.endsWith('///')) {
                            filename = frame.filename.indexOf('/') === 0 ? `${appPrefix}${frame.filename}` : `${appPrefix}/${frame.filename}`;
                        } else {
                            filename = frame.filename.indexOf('/') === 0 ? `${appPrefix}${frame.filename.slice(1)}` : `${appPrefix}${frame.filename}`;
                        }
                    }

                    frame.filename = filename;
                    // We always want to have a tripple slash
                }
                return frame;
            },
        }) as any;
        options.defaultIntegrations = [
            new NativescriptErrorHandlers(options),
            new Release(),
            ...defaultIntegrations.filter((i) => !IGNORED_DEFAULT_INTEGRATIONS.includes(i.name)),
            new Integrations.Breadcrumbs({
                console: false,
                xhr: false,
                dom: false,
                fetch: false,
                ...(options.breadcrumbs || {})
            }),
            rewriteFrameIntegration as any,
            new DeviceContext(),
        ];
    }
    if (options.enableNative === undefined) {
        options.enableNative = true;
    }
    if (options.enableNativeCrashHandling === undefined) {
        options.enableNativeCrashHandling = true;
    }
    // if (options.enableNativeNagger === undefined) {
    //     options.enableNativeNagger = true;
    // }
    initAndBind(NativescriptClient, options);

    // set the event.origin tag.
    getCurrentHub().setTag('event.origin', 'javascript');
}

/**
 * Sets the release on the event.
 */
export function setRelease(release: string): void {
    setExtra('__sentry_release', release);
}

/**
 * Sets the dist on the event.
 */
export function setDist(dist: string): void {
    setExtra('__sentry_dist', dist);
}

/**
 * If native client is available it will trigger a native crash.
 * Use this only for testing purposes.
 */
export function nativeCrash(): void {
    const client = getCurrentHub().getClient<NativescriptClient>();
    if (client) {
        client.nativeCrash();
    }
}
