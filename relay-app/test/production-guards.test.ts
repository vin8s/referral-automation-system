// Development-only stand-ins must fail closed when NODE_ENV=production.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSmsProvider } from '@/server/sms/provider';
import { getSmsAgentModel } from '@/server/sms/model';
import { authMode } from '@/server/auth/config';

describe('production guards', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('refuses the mock SMS provider (unset or explicit) in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMS_PROVIDER', '');
    expect(() => getSmsProvider()).toThrow(/refused in production/);
    vi.stubEnv('SMS_PROVIDER', 'mock');
    expect(() => getSmsProvider()).toThrow(/refused in production/);
    vi.stubEnv('SMS_PROVIDER', 'aws');
    expect(getSmsProvider().name).toBe('aws');
  });

  it('refuses the mock AI model in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AI_PROVIDER', '');
    expect(() => getSmsAgentModel()).toThrow(/refused in production/);
    vi.stubEnv('AI_PROVIDER', 'bedrock');
    expect(getSmsAgentModel().name).toBe('bedrock');
  });

  it('still allows the mocks outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SMS_PROVIDER', '');
    vi.stubEnv('AI_PROVIDER', '');
    expect(getSmsProvider().name).toBe('mock');
    expect(getSmsAgentModel().name).toBe('mock');
  });

  it('refuses mock login in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_MODE', 'mock');
    expect(() => authMode()).toThrow(/mock login is disabled in production/);
  });
});
