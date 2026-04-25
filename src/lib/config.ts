const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '/api';
const META_APP_ID = import.meta.env.VITE_META_APP_ID?.trim() || '';
const META_CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID?.trim() || '';
const INSTAGRAM_APP_ID = import.meta.env.VITE_INSTAGRAM_APP_ID?.trim() || '';
const INSTAGRAM_CONFIG_ID = import.meta.env.VITE_INSTAGRAM_CONFIG_ID?.trim() || '';
const META_GRAPH_VERSION = import.meta.env.VITE_META_GRAPH_VERSION?.trim() || 'v24.0';
const DEFAULT_TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || '0x4AAAAAAC9513RDryb1Cua4';
const LOCAL_TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_LOCAL_SITE_KEY?.trim() || '';
const HOSTNAME =
  typeof window !== 'undefined' ? window.location.hostname.trim().toLowerCase() : '';
const IS_LOCALHOST =
  HOSTNAME === 'localhost' ||
  HOSTNAME === '127.0.0.1' ||
  HOSTNAME === '0.0.0.0' ||
  HOSTNAME === '::1' ||
  HOSTNAME === '[::1]';
const TURNSTILE_SITE_KEY = IS_LOCALHOST
  ? LOCAL_TURNSTILE_SITE_KEY || DEFAULT_TURNSTILE_SITE_KEY
  : DEFAULT_TURNSTILE_SITE_KEY;

export const clientConfig = {
  apiBaseUrl: API_BASE_URL,
  meta: {
    appId: META_APP_ID,
    configId: META_CONFIG_ID,
    graphVersion: META_GRAPH_VERSION,
  },
  instagram: {
    appId: INSTAGRAM_APP_ID,
    configId: INSTAGRAM_CONFIG_ID,
    graphVersion: META_GRAPH_VERSION,
  },
  messenger: {
    appId: META_APP_ID,
    graphVersion: META_GRAPH_VERSION,
  },
  turnstile: {
    siteKey: TURNSTILE_SITE_KEY,
    isLocalhost: IS_LOCALHOST,
    usingLocalOverride: Boolean(IS_LOCALHOST && LOCAL_TURNSTILE_SITE_KEY),
  },
};

export const hasEmbeddedSignupConfig = Boolean(META_APP_ID && META_CONFIG_ID);
export const hasInstagramBusinessLoginConfig = Boolean(INSTAGRAM_APP_ID);
export const hasMessengerLoginConfig = Boolean(META_APP_ID);
export const hasTurnstileSiteKey = Boolean(TURNSTILE_SITE_KEY);
