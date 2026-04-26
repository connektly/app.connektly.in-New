import { clientConfig } from './config';

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
      login: (
        callback: (response: {
          status?: string;
          authResponse?: {
            code?: string;
            accessToken?: string;
          };
        }) => void,
        options?: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

interface EmbeddedSignupSession {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  redirectUri: string;
}

export interface InstagramBusinessLoginSession {
  accessToken: string;
  longLivedToken: string | null;
  expiresIn: number | null;
  dataAccessExpirationTime: string | null;
}

export interface MessengerPageLoginSession {
  accessToken: string;
}

interface InstagramBusinessLoginMessage {
  type?: string;
  state?: string | null;
  accessToken?: string | null;
  longLivedToken?: string | null;
  expiresIn?: number | null;
  dataAccessExpirationTime?: string | null;
  error?: string | null;
}

let sdkPromise: Promise<void> | null = null;

export const INSTAGRAM_BUSINESS_LOGIN_EVENT = 'CONNEKTLY_INSTAGRAM_BUSINESS_LOGIN';
const INSTAGRAM_LOGIN_SCOPES = [
  'instagram_basic',
  'instagram_manage_messages',
  'pages_show_list',
  'pages_read_engagement',
];
const MESSENGER_LOGIN_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
];

function injectMetaScript() {
  if (document.querySelector('script[data-meta-sdk="true"]')) {
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://connect.facebook.net/en_US/sdk.js';
  script.async = true;
  script.defer = true;
  script.dataset.metaSdk = 'true';
  document.head.appendChild(script);
}

export async function ensureMetaSdkReady() {
  if (!clientConfig.meta.appId) {
    throw new Error('Meta SDK is not configured. Set VITE_META_APP_ID first.');
  }

  if (window.FB) {
    return;
  }

  if (!sdkPromise) {
    sdkPromise = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('Timed out while loading the Meta SDK.'));
      }, 15000);

      window.fbAsyncInit = () => {
        try {
          window.FB?.init({
            appId: clientConfig.meta.appId,
            cookie: true,
            xfbml: false,
            version: clientConfig.meta.graphVersion,
          });
          window.clearTimeout(timeout);
          resolve();
        } catch (error) {
          window.clearTimeout(timeout);
          reject(error);
        }
      };

      injectMetaScript();
    });
  }

  return sdkPromise;
}

export async function beginEmbeddedSignup() {
  if (!clientConfig.meta.configId) {
    throw new Error(
      'Meta embedded signup is not configured. Set VITE_META_CONFIG_ID first.',
    );
  }

  await ensureMetaSdkReady();
  const redirectUri = `${window.location.origin}${window.location.pathname}${window.location.search}`;

  return new Promise<EmbeddedSignupSession>((resolve, reject) => {
    let authCode: string | null = null;
    let sessionInfo: { wabaId?: string; phoneNumberId?: string } = {};

    const maybeResolve = () => {
      if (authCode && sessionInfo.wabaId && sessionInfo.phoneNumberId) {
        cleanup();
        resolve({
          code: authCode,
          wabaId: sessionInfo.wabaId,
          phoneNumberId: sessionInfo.phoneNumberId,
          redirectUri,
        });
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const trustedOrigin = typeof event.origin === 'string' && event.origin.includes('facebook.com');

      if (!trustedOrigin || typeof event.data !== 'string') {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          event?: string;
          data?: {
            phone_number_id?: string;
            waba_id?: string;
          };
        };

        if (payload.type !== 'WA_EMBEDDED_SIGNUP' || payload.event !== 'FINISH') {
          return;
        }

        sessionInfo = {
          wabaId: payload.data?.waba_id,
          phoneNumberId: payload.data?.phone_number_id,
        };
        maybeResolve();
      } catch {
        return;
      }
    };

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
    };

    window.addEventListener('message', handleMessage);
    const fb = window.FB;
    if (!fb) {
      cleanup();
      reject(new Error('Meta SDK did not initialize correctly.'));
      return;
    }

    fb.login(
      (response) => {
        if (response.status !== 'connected' || !response.authResponse?.code) {
          cleanup();
          reject(new Error('Meta signup was cancelled before authorization completed.'));
          return;
        }

        authCode = response.authResponse.code;
        window.setTimeout(() => {
          if (!sessionInfo.wabaId || !sessionInfo.phoneNumberId) {
            cleanup();
            reject(
              new Error(
                'Meta signup finished but the account identifiers were not returned. Use manual connection as a fallback.',
              ),
            );
            return;
          }

          maybeResolve();
        }, 3000);
      },
      {
        config_id: clientConfig.meta.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: 3,
          featureType: 'whatsapp_embedded_signup',
        },
      },
    );
  });
}

export async function beginMessengerPageLogin() {
  await ensureMetaSdkReady();

  return new Promise<MessengerPageLoginSession>((resolve, reject) => {
    const fb = window.FB;

    if (!fb) {
      reject(new Error('Meta SDK did not initialize correctly.'));
      return;
    }

    fb.login(
      (response) => {
        if (response.status !== 'connected' || !response.authResponse?.accessToken) {
          reject(new Error('Messenger login was cancelled before authorization completed.'));
          return;
        }

        resolve({
          accessToken: response.authResponse.accessToken,
        });
      },
      {
        scope: MESSENGER_LOGIN_SCOPES.join(','),
        return_scopes: true,
        auth_type: 'rerequest',
      },
    );
  });
}

function buildInstagramRedirectUri() {
  return `${window.location.origin}/auth/instagram/callback`;
}

function buildInstagramBusinessLoginUrl(state: string) {
  const url = new URL(
    `https://www.facebook.com/${clientConfig.instagram.graphVersion}/dialog/oauth`,
  );

  url.searchParams.set('client_id', clientConfig.instagram.appId);
  url.searchParams.set('display', 'page');
  url.searchParams.set('redirect_uri', buildInstagramRedirectUri());
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', INSTAGRAM_LOGIN_SCOPES.join(','));
  url.searchParams.set(
    'extras',
    JSON.stringify({
      setup: {
        channel: 'IG_API_ONBOARDING',
      },
    }),
  );
  url.searchParams.set('state', state);

  if (clientConfig.instagram.configId) {
    url.searchParams.set('config_id', clientConfig.instagram.configId);
  }

  return url.toString();
}

function generateOauthState() {
  const values = new Uint32Array(4);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16)).join('');
}

export async function beginInstagramBusinessLogin() {
  if (!clientConfig.instagram.appId) {
    throw new Error(
      'Instagram Business Login is not configured. Set VITE_INSTAGRAM_APP_ID first.',
    );
  }

  const state = generateOauthState();
  const popup = window.open(
    buildInstagramBusinessLoginUrl(state),
    'connektly-instagram-business-login',
    'popup=yes,width=520,height=720,menubar=no,toolbar=no,location=yes,status=no',
  );

  if (!popup) {
    throw new Error('The Instagram login popup was blocked by the browser.');
  }

  popup.focus();

  return new Promise<InstagramBusinessLoginSession>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      settled = true;
      window.clearInterval(closePoll);
      window.clearTimeout(timeout);
      window.removeEventListener('message', handleMessage);
    };

    const rejectWith = (message: string) => {
      cleanup();
      reject(new Error(message));
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data as InstagramBusinessLoginMessage;

      if (!payload || payload.type !== INSTAGRAM_BUSINESS_LOGIN_EVENT) {
        return;
      }

      if (payload.state !== state) {
        return;
      }

      if (payload.error) {
        rejectWith(payload.error);
        return;
      }

      const longLivedToken = payload.longLivedToken?.trim();
      const accessToken = payload.accessToken?.trim();

      if (!accessToken) {
        rejectWith('Instagram Business Login did not return the expected access token.');
        return;
      }

      cleanup();
      resolve({
        accessToken,
        longLivedToken: longLivedToken || null,
        expiresIn:
          typeof payload.expiresIn === 'number' && Number.isFinite(payload.expiresIn)
            ? payload.expiresIn
            : null,
        dataAccessExpirationTime: payload.dataAccessExpirationTime || null,
      });
    };

    const closePoll = window.setInterval(() => {
      if (!settled && popup.closed) {
        rejectWith('Instagram Business Login was closed before it finished.');
      }
    }, 400);

    const timeout = window.setTimeout(() => {
      if (!settled) {
        rejectWith('Instagram Business Login timed out before Meta returned the account details.');
      }
    }, 120000);

    window.addEventListener('message', handleMessage);
  });
}
