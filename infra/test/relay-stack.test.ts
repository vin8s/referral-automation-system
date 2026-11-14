// Synthesizes the Relay stack (offline, no AWS calls) and checks the security
// properties the HIPAA checklist relies on. Run: `npm test` (from infra/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { RelayStack, readConfig } from '../lib/relay-stack.js';

function synth(context: Record<string, unknown> = {}) {
  const app = new App({ context: { 'relay:region': 'us-east-2', ...context } });
  const stack = new RelayStack(app, 'Relay', {
    config: readConfig(app),
    env: { account: '111111111111', region: readConfig(app).region },
  });
  return Template.fromStack(stack);
}

const template = synth();
const json = JSON.stringify(template.toJSON());

test('no regional resource is pinned to a Region other than us-east-2', () => {
  assert.ok(!json.includes('us-east-1'), 'template mentions us-east-1');
  assert.ok(!json.includes('us-west-2'), 'template mentions us-west-2');
});

test('database is private, encrypted, backed up and deletion-protected', () => {
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    PubliclyAccessible: false,
    StorageEncrypted: true,
    DeletionProtection: true,
    BackupRetentionPeriod: 14,
  });
  template.hasResourceProperties('AWS::RDS::DBParameterGroup', { Parameters: { 'rds.force_ssl': '1' } });
});

test('load balancer serves HTTPS and redirects HTTP', () => {
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', { Port: 443, Protocol: 'HTTPS' });
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 80,
    DefaultActions: [Match.objectLike({ Type: 'redirect', RedirectConfig: Match.objectLike({ Protocol: 'HTTPS' }) })],
  });
});

test('SNS may use the data key to write into the encrypted inbound dead-letter queue', () => {
  template.hasResourceProperties('AWS::KMS::Key', {
    KeyPolicy: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Sid: 'AllowSnsToUseKeyForInboundDeadLetters',
          Principal: { Service: 'sns.amazonaws.com' },
          Action: Match.arrayWith(['kms:Decrypt']),
        }),
      ]),
    },
  });
  template.hasResourceProperties('AWS::SNS::Topic', { TopicName: 'relay-inbound-sms' });
});

test('Bedrock permission covers the inference profile and the foundation models in every Region', () => {
  const policies = template.findResources('AWS::IAM::Policy');
  const text = JSON.stringify(policies);
  assert.match(text, /:inference-profile\/\*/);
  assert.match(text, /:bedrock:\*::foundation-model\/anthropic\.claude-\*/);
});

test('Cognito requires TOTP MFA and allows no self sign-up', () => {
  template.hasResourceProperties('AWS::Cognito::UserPool', {
    MfaConfiguration: 'ON',
    EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
    AdminCreateUserConfig: Match.objectLike({ AllowAdminCreateUserOnly: true }),
  });
});

test('pauseTexting denies SMS and RCS sends and disables the outreach schedule', () => {
  const paused = synth({ 'relay:pauseTexting': true });
  paused.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Sid: 'EmergencyPauseAllTexting',
          Effect: 'Deny',
          Action: Match.arrayWith(['sms-voice:SendTextMessage', 'sms-voice:SendRcsMessage']),
        }),
      ]),
    },
  });
  paused.hasResourceProperties('AWS::Scheduler::Schedule', { State: 'DISABLED' });
});
