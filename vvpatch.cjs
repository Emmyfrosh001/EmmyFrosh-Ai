// vvpatch.cjs — makes the MAIN bot connect with the Android identity (no second device, no linking)
//
// WhatsApp only hands view-once media to a linked device that logs in as Android. The bot's own
// connection code is encrypted, so instead of editing it, this file runs BEFORE the bot
// (node -r ./vvpatch.cjs index.js) and quietly wraps Baileys' makeWASocket: when the bot opens its
// connection with an already-linked session, the browser setting is swapped to Browsers.android.
// Your existing session / pairing site stay exactly as they are.
//
// Turn it off any time with VV_ANDROID=off in .env (the Android helper device in messages.js
// then takes over). Business WhatsApp account? Use VV_ANDROID=smb.

const Module = require('module');

const MODE = () => String(process.env.VV_ANDROID || 'on').toLowerCase();
const wrappedFns = new WeakMap();   // original makeWASocket -> wrapped (stable identity)
const proxies = new WeakMap();      // original exports object -> proxy
let warnedOld = false;

function patchConfig(baileys, config) {
    try {
        if (MODE() === 'off' || !config || typeof config !== 'object') return config;
        if (!config.auth?.creds?.registered) return config;            // still pairing: leave it alone
        const Browsers = baileys.Browsers;
        const make = MODE() === 'smb' ? Browsers?.SMB_ANDROID : Browsers?.android;
        if (typeof make !== 'function') {
            if (!warnedOld) { warnedOld = true; console.log('[VVPATCH] This Baileys has no Browsers.android, so the identity was NOT changed. Update with: npm i @whiskeysockets/baileys@latest'); }
            return config;
        }
        global.__vvAndroidPatched = true;
        console.log('[VVPATCH] Connecting with the Android identity (view-once enabled)');
        return { ...config, browser: make('13') };
    } catch (e) {
        console.log('[VVPATCH] skipped:', e?.message || e);
        return config;
    }
}

function wrapMake(baileys, fn) {
    if (wrappedFns.has(fn)) return wrappedFns.get(fn);
    const wrapped = function (config, ...rest) { return fn.call(this, patchConfig(baileys, config), ...rest); };
    Object.setPrototypeOf(wrapped, fn);
    for (const k of Object.getOwnPropertyNames(fn)) {
        if (['length', 'name', 'prototype', 'caller', 'arguments'].includes(k)) continue;
        try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(fn, k)); } catch { /* ignore */ }
    }
    wrappedFns.set(fn, wrapped);
    return wrapped;
}

function wrapExports(exp) {
    if (!exp || (typeof exp !== 'object' && typeof exp !== 'function')) return exp;
    if (proxies.has(exp)) return proxies.get(exp);
    const base = exp.default && typeof exp.default === 'object' && exp.Browsers === undefined ? exp.default : exp;
    const proxy = new Proxy(exp, {
        get(target, prop) {
            const value = Reflect.get(target, prop, target);
            if ((prop === 'default' || prop === 'makeWASocket') && typeof value === 'function') return wrapMake(base, value);
            return value;
        },
        apply(target, thisArg, args) {          // in case the module itself is the function
            return typeof target === 'function' ? wrapMake(base, target).apply(thisArg, args) : undefined;
        }
    });
    proxies.set(exp, proxy);
    return proxy;
}

const origLoad = Module._load;
Module._load = function (request) {
    const result = origLoad.apply(this, arguments);
    if (request === '@whiskeysockets/baileys' || request === 'baileys') {
        try { return wrapExports(result); } catch { return result; }
    }
    return result;
};

console.log('[VVPATCH] loaded');
