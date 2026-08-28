export type AppEnvironment = 'main' | 'test';

export interface EnvironmentConfig {
  id: AppEnvironment;
  name: string;
  badge: string;
  botUsername: string;
  botToken: string;
  botTokenMasked: string;
  spreadsheetId: string;
  miniAppUrl: string;
  miniAppShortName: string;
  defaultGasUrl: string;
  themeColor: string;
  description: string;
}

export const ENVIRONMENTS: Record<AppEnvironment, EnvironmentConfig> = {
  main: {
    id: 'main',
    name: 'Production (Main)',
    badge: 'PROD',
    botUsername: 'splitnest_bot',
    botToken: '8949508191:AAEnVE-w0bbqICLi_CJYkqiEXcbGkUcMi3I',
    botTokenMasked: '8949508191:AAEnVE...cMi3I',
    spreadsheetId: '106hKhXEEObyEbWJDxu0dFax-fKUIiDmkO1klpPPSJuM',
    miniAppUrl: 'https://t.me/splitnest_bot/ambugan',
    miniAppShortName: 'ambugan',
    defaultGasUrl: 'https://script.google.com/macros/s/AKfycbyzs2hkta9HPE7MDkHgXw6Fk56r9WBaSb_7M9Y3H_cIUfZsDdJJsIpF8dEqTvC4bU5J/exec',
    themeColor: '#10B981',
    description: 'Live production environment connected to @splitnest_bot and official production Google Sheet.'
  },
  test: {
    id: 'test',
    name: 'Test Bot (Staging)',
    badge: 'TEST',
    botUsername: 'splistnest_test_bot',
    botToken: '8975116420:AAG6KT1W-ooFG-zFq4QcEDWAL9U9AotRT2Y',
    botTokenMasked: '8975116420:AAG6KT...RT2Y',
    spreadsheetId: '1w7-vyYvVPO505o6UlbfI29LA8qOWtLpuWP4_lFXLym0',
    miniAppUrl: 'https://t.me/splistnest_test_bot/test',
    miniAppShortName: 'test',
    defaultGasUrl: '',
    themeColor: '#8B5CF6',
    description: 'Safe testing sandbox connected to @splistnest_test_bot and dedicated test Google Sheet.'
  }
};

const STORAGE_KEY_ENV = 'splitnest_app_environment';

/**
 * Detect current environment from Telegram WebApp context, URL parameters, or localStorage.
 */
export function getStoredEnvironment(): AppEnvironment {
  // 1. Check URL query/hash params
  if (typeof window !== 'undefined') {
    const searchParams = new URLSearchParams(window.location.search);
    const envParam = searchParams.get('env') || searchParams.get('environment');
    if (envParam === 'test' || envParam === 'staging') return 'test';
    if (envParam === 'main' || envParam === 'prod') return 'main';

    // 2. Check if running inside Telegram WebApp with test bot username in initData
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initDataUnsafe?.bot_username) {
      if (tg.initDataUnsafe.bot_username.toLowerCase().includes('test')) return 'test';
    }

    // 3. Check localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ENV);
      if (saved === 'test' || saved === 'main') return saved;
    } catch (e) {}
  }
  return 'main';
}

export function saveStoredEnvironment(env: AppEnvironment): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_ENV, env);
    } catch (e) {}
  }
}
