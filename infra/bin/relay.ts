#!/usr/bin/env node
// CDK entry point. `npx cdk synth` works without AWS credentials (the stack is
// region/account agnostic until you deploy). Settings live in cdk.json → "relay";
// override one at deploy time with e.g.  npx cdk deploy -c relay:pauseTexting=true
import { App, Tags } from 'aws-cdk-lib';
import { RelayStack, readConfig } from '../lib/relay-stack.js';

const app = new App();
const config = readConfig(app);

new RelayStack(app, 'Relay', {
  config,
  description: 'Relay referral SMS pilot: ECS Fargate app, private RDS Postgres, Cognito, SMS wiring (see docs/AWS_DEPLOYMENT_GUIDE.md)',
  // Region comes from cdk.json (relay:region); the account is the one your AWS CLI
  // profile is signed in to at deploy time (blank during an offline `cdk synth`).
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: config.region },
  terminationProtection: true,
});

Tags.of(app).add('project', 'relay');
Tags.of(app).add('data-classification', 'phi');
