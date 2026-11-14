// Mock SMS, mock AI and the patient simulator must be impossible in production.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSmsProvider } from '@/server/sms/provider';
import { getSmsAgentModel } from '@/server/sms/model';
import { SmsActionError, simulatePatientText } from '@/server/sms';

afterEach(() => { vi.unstubAllEnvs(); });

describe('production refuses development-only SMS pieces', () => {
  it('SMS_PROVIDER unset or mock → throws in production (texts would silently not be sent)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMS_PROVIDER', '');
    expect(() => getSmsProvider()).toThrow(/aws/);
    vi.stubEnv('SMS_PROVIDER', 'mock');
    expect(() => getSmsProvider()).toThrow(/aws/);
  });

  it('SMS_PROVIDER=aws is accepted in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMS_PROVIDER', 'aws');
    expect(getSmsProvider().name).toBe('aws');
  });

  it('AI_PROVIDER unset → the keyword mock model is refused in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AI_PROVIDER', '');
    expect(() => getSmsAgentModel()).toThrow(/bedrock/);
    vi.stubEnv('AI_PROVIDER', 'bedrock');
    expect(getSmsAgentModel().name).toBe('bedrock');
  });

  it('mock is still the default in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SMS_PROVIDER', '');
    vi.stubEnv('AI_PROVIDER', '');
    expect(getSmsProvider().name).toBe('mock');
    expect(getSmsAgentModel().name).toBe('mock');
  });

  it('the patient simulator (fake inbound texts) is refused in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMS_PROVIDER', '');
    const err = await simulatePatientText('REF-1', 'hi', { id: 'u', name: 'Admin', role: 'admin' }).catch(e => e);
    expect(err).toBeInstanceOf(SmsActionError);
    expect((err as SmsActionError).status).toBe(404);
  });
});
