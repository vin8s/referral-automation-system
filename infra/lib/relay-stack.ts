// Relay on AWS: everything the SMS pilot needs, in one CloudFormation stack.
//
//   Internet ──HTTPS──▶ Application Load Balancer (public subnets, TLS cert from ACM)
//                         └──▶ ECS Fargate task: Relay container (public subnet, no inbound
//                              except from the load balancer)
//                                 └──TLS──▶ RDS Postgres (isolated subnets, no internet route)
//   Cognito user pool (staff login, MFA required)  ·  Secrets Manager (keys/passwords)
//   SNS topic ◀── AWS End User Messaging (inbound texts) ──HTTPS──▶ /api/sms/inbound
//   EventBridge Scheduler ──▶ tiny Lambda ──HTTPS + bearer──▶ /api/sms/outreach/tick
//   CloudTrail · CloudWatch logs + alarms · AWS Budgets · one KMS key for data at rest
//
// No NAT gateway (saves ~$33/month): the app task gets a public IP for *outbound*
// calls to AWS APIs (Bedrock, SMS, Secrets Manager, ECR), all over TLS; its security
// group only accepts traffic from the load balancer. The database has no public IP
// and no route to the internet at all.
//
// See docs/AWS_DEPLOYMENT_GUIDE.md (how) and docs/AWS_HIPAA_CHECKLIST.md (why).

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Annotations, Aws, CfnOutput, Duration, RemovalPolicy, Stack, TimeZone, type StackProps,
} from 'aws-cdk-lib';
import type { Construct, IConstruct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as schedulerTargets from 'aws-cdk-lib/aws-scheduler-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as smsvoice from 'aws-cdk-lib/aws-smsvoice';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';

// ── Settings (cdk.json → "relay:*", or `-c relay:key=value`) ─────────────────

export interface RelayConfig {
  /** AWS Region for everything. The project's home Region is us-east-2 (Ohio); the org's Region-restriction SCP denies regional services elsewhere. */
  region: string;
  /** Public hostname staff type into the browser, e.g. relay.myclinic.org. */
  domainName: string;
  /** Route 53 hosted zone for domainName's parent. Blank → you add DNS records by hand. */
  hostedZoneId: string;
  hostedZoneName: string;
  /** Globally unique prefix for the Cognito sign-in page: <prefix>.auth.<region>.amazoncognito.com */
  cognitoDomainPrefix: string;
  /** Clinic name shown on Relay's sign-in screen and in the staff invitation email. */
  clinicLoginName: string;
  /** Receives budget and alarm emails. */
  alertEmail: string;
  clinicTimeZone: string;
  clinicDisplayName: string;
  clinicPhoneNumber: string;
  /** End User Messaging phone number ID/ARN (blank until you've bought one). */
  smsOriginationIdentity: string;
  bedrockModelId: string;
  /** EventBridge Scheduler cron, interpreted in clinicTimeZone. */
  outreachCron: string;
  outreachEnabled: boolean;
  /** Emergency switch: true → the app is DENIED permission to send any text. */
  pauseTexting: boolean;
  /** Subscribe <APP_URL>/api/sms/inbound to the inbound SNS topic. */
  subscribeInboundSms: boolean;
  budgetWarnUsd: number;
  budgetLimitUsd: number;
}

export function readConfig(scope: IConstruct): RelayConfig {
  const raw = (key: string): unknown => scope.node.tryGetContext(`relay:${key}`);
  const str = (key: string, fallback = ''): string => {
    const v = raw(key);
    return v === undefined || v === null ? fallback : String(v).trim();
  };
  const bool = (key: string, fallback: boolean): boolean => {
    const v = raw(key);
    if (v === undefined || v === null || v === '') return fallback;
    return v === true || String(v).toLowerCase() === 'true';
  };
  const num = (key: string, fallback: number): number => {
    const n = Number(raw(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    region: str('region', 'us-east-2'),
    domainName: str('domainName', 'relay.example.org').toLowerCase(),
    hostedZoneId: str('hostedZoneId'),
    hostedZoneName: str('hostedZoneName'),
    cognitoDomainPrefix: str('cognitoDomainPrefix', 'relay-clinic-change-me').toLowerCase(),
    clinicLoginName: str('clinicLoginName', 'Clinica Esperanza / Hope Clinic'),
    alertEmail: str('alertEmail', 'owner@example.org'),
    clinicTimeZone: str('clinicTimeZone', 'America/Los_Angeles'),
    clinicDisplayName: str('clinicDisplayName', 'Example Free Clinic'),
    clinicPhoneNumber: str('clinicPhoneNumber'),
    smsOriginationIdentity: str('smsOriginationIdentity'),
    bedrockModelId: str('bedrockModelId', 'us.anthropic.claude-haiku-4-5-20251001-v1:0'),
    outreachCron: str('outreachCron', 'cron(0/10 8-19 ? * MON-SAT *)'),
    outreachEnabled: bool('outreachEnabled', true),
    pauseTexting: bool('pauseTexting', false),
    subscribeInboundSms: bool('subscribeInboundSms', true),
    budgetWarnUsd: num('budgetWarnUsd', 50),
    budgetLimitUsd: num('budgetLimitUsd', 100),
  };
}

export interface RelayStackProps extends StackProps {
  config: RelayConfig;
}

const LOG_RETENTION = logs.RetentionDays.ONE_YEAR;
const DB_NAME = 'relay';
const RDS_CA_PATH = '/app/certs/rds-global-bundle.pem'; // baked into the image (relay-app/Dockerfile)

export class RelayStack extends Stack {
  constructor(scope: Construct, id: string, props: RelayStackProps) {
    super(scope, id, props);
    const cfg = props.config;
    const appUrl = `https://${cfg.domainName}`;

    for (const [key, value] of Object.entries({
      domainName: cfg.domainName.endsWith('example.org'),
      cognitoDomainPrefix: cfg.cognitoDomainPrefix.includes('change-me'),
      alertEmail: cfg.alertEmail.endsWith('example.org'),
    })) {
      if (value) Annotations.of(this).addWarningV2(`relay:${key}`, `relay:${key} is still the placeholder value in infra/cdk.json. Set it before deploying.`);
    }

    // ── Encryption key for data at rest (database, secrets, logs, SNS, SQS) ──
    const dataKey = new kms.Key(this, 'DataKey', {
      alias: 'alias/relay-data',
      description: 'Relay: encrypts the database, secrets, logs and SMS queues',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN, // deleting the key would make backups unreadable
    });
    dataKey.grantEncryptDecrypt(new iam.ServicePrincipal(`logs.${Aws.REGION}.amazonaws.com`));

    const logGroup = (name: string, logicalId: string) =>
      new logs.LogGroup(this, logicalId, {
        logGroupName: `/relay/${name}`,
        retention: LOG_RETENTION,
        encryptionKey: dataKey,
        removalPolicy: RemovalPolicy.RETAIN,
      });

    // ── Network ──
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2, // RDS and the load balancer each need two Availability Zones
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'database', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      restrictDefaultSecurityGroup: true,
    });
    vpc.addFlowLog('RejectedTraffic', {
      trafficType: ec2.FlowLogTrafficType.REJECT,
      destination: ec2.FlowLogDestination.toCloudWatchLogs(logGroup('vpc-flow-rejected', 'FlowLogGroup')),
    });

    // ── Database: private RDS Postgres ──
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Relay database: only the Relay app may connect',
      allowAllOutbound: false,
    });
    const db = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      publiclyAccessible: false,
      multiAz: false, // pilot: one instance; restore from backup if the AZ fails
      databaseName: DB_NAME,
      credentials: rds.Credentials.fromGeneratedSecret('relay_admin', {
        secretName: 'relay/database',
        encryptionKey: dataKey,
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
      }),
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      storageEncryptionKey: dataKey,
      caCertificate: rds.CaCertificate.RDS_CA_RSA2048_G1,
      parameterGroup: new rds.ParameterGroup(this, 'DbParams', {
        engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17 }),
        parameters: { 'rds.force_ssl': '1' }, // refuse unencrypted connections
      }),
      backupRetention: Duration.days(14),
      preferredBackupWindow: '09:00-09:30', // UTC = ~1–2 AM Pacific
      preferredMaintenanceWindow: 'sun:10:00-sun:10:30',
      copyTagsToSnapshot: true,
      autoMinorVersionUpgrade: true,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT, // a final snapshot is kept on teardown
    });
    const dbSecret = db.secret!;

    // ── Staff login: Cognito (managed login) ──
    // Decisions (see docs/STAFF_LOGINS.md and docs/AWS_HIPAA_CHECKLIST.md):
    //   • Only the owner creates accounts (no self sign-up). Cognito emails a temporary
    //     password; the first sign-in forces a new password, then authenticator-app (TOTP)
    //     enrollment. MFA is REQUIRED for everyone; SMS MFA is off (no SNS, no SIM-swap risk).
    //   • "Forgot password" works by a code emailed to the person's verified address.
    //   • Email is sent by Cognito's built-in sender (no SES setup). Limit: 50 emails/day
    //     per AWS account — plenty for ~5 staff. Switch to SES if that ever bites.
    //   • Relay keeps no Cognito tokens: it reads the ID token once at sign-in and issues its
    //     own cookie (30 min idle / 8 h absolute). So Cognito token lifetimes are short.
    const userPool = new cognito.UserPool(this, 'StaffUserPool', {
      userPoolName: 'relay-staff',
      featurePlan: cognito.FeaturePlan.ESSENTIALS, // needed for managed login + branding + Spanish pages
      selfSignUpEnabled: false, // AllowAdminCreateUserOnly: only an admin can create staff accounts
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      // (given_name / family_name / name are standard attributes and always available.)
      standardAttributes: { email: { required: true, mutable: true } },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { otp: true, sms: false }, // authenticator app only
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3), // invitation must be used within 3 days
        passwordHistorySize: 5, // can't reuse the last 5 passwords (Essentials)
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: cognito.UserPoolEmail.withCognito(), // COGNITO_DEFAULT: no-reply@verificationemail.com, 50/day
      userInvitation: {
        emailSubject: `Your Relay account for ${cfg.clinicLoginName}`,
        emailBody: invitationEmail(appUrl, cfg.clinicLoginName),
      },
      userVerification: {
        // Used for "Forgot password" codes (and email verification).
        emailSubject: 'Your Relay verification code',
        emailBody: verificationEmail(cfg.clinicLoginName),
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'admin',
      description: 'Relay administrators (can change settings)',
      precedence: 1,
    });
    new cognito.CfnUserPoolGroup(this, 'MaGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'ma',
      description: 'Medical assistants / front desk',
      precedence: 2,
    });
    const userPoolDomain = userPool.addDomain('HostedDomain', {
      cognitoDomain: { domainPrefix: cfg.cognitoDomainPrefix },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN, // branded pages, prompt=login, lang=es
    });
    const appClient = userPool.addClient('RelayWebClient', {
      userPoolClientName: 'relay-web',
      generateSecret: true, // confidential client (the Next.js server holds the secret); PKCE on top
      authFlows: {}, // only the managed sign-in pages; no direct password APIs
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`${appUrl}/api/auth/callback`],
        // Must match relay-app/src/server/auth/cognito.ts LOGOUT_RETURN_PATHS exactly.
        logoutUrls: [`${appUrl}/login?signed_out=1`, `${appUrl}/login?error=no_role`],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
      // Relay reads the ID token once at sign-in and never stores Cognito tokens.
      idTokenValidity: Duration.minutes(15),
      accessTokenValidity: Duration.minutes(15),
      refreshTokenValidity: Duration.minutes(60), // minimum allowed; unused by Relay
      // Time allowed between sign-in steps (password → new password → authenticator setup).
      authSessionValidity: Duration.minutes(15), // maximum; first sign-in includes installing an app
      enableTokenRevocation: true,
    });
    // Managed login needs a branding style per app client (CloudFormation/CDK don't add one).
    const branding = new cognito.CfnManagedLoginBranding(this, 'ManagedLoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: appClient.userPoolClientId,
      settings: managedLoginSettings(),
      assets: [{
        category: 'FORM_LOGO',
        colorMode: 'LIGHT',
        extension: 'PNG',
        bytes: fs.readFileSync(path.join(__dirname, '..', 'assets', 'cognito-form-logo.png')).toString('base64'),
      }],
    });
    branding.node.addDependency(userPoolDomain);

    // ── App secrets ──
    const authSecret = new secretsmanager.Secret(this, 'AuthSecret', {
      secretName: 'relay/auth-secret',
      description: 'AUTH_SECRET: signs Relay session cookies',
      encryptionKey: dataKey,
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });
    const outreachToken = new secretsmanager.Secret(this, 'OutreachCronToken', {
      secretName: 'relay/outreach-cron-token',
      description: 'OUTREACH_CRON_TOKEN: bearer token for /api/sms/outreach/tick',
      encryptionKey: dataKey,
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });
    const cognitoClientSecret = new secretsmanager.Secret(this, 'CognitoClientSecret', {
      secretName: 'relay/cognito-client-secret',
      description: 'COGNITO_CLIENT_SECRET for the relay-web app client',
      encryptionKey: dataKey,
      secretStringValue: appClient.userPoolClientSecret,
    });

    // ── Inbound SMS: End User Messaging → SNS → Relay ──
    const inboundDlq = new sqs.Queue(this, 'InboundSmsDeadLetters', {
      queueName: 'relay-inbound-sms-dlq',
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: dataKey,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });
    const inboundTopic = new sns.Topic(this, 'InboundSmsTopic', {
      topicName: 'relay-inbound-sms',
      displayName: 'Relay inbound SMS',
      masterKey: dataKey,
      enforceSSL: true,
    });
    const smsService = new iam.ServicePrincipal('sms-voice.amazonaws.com');
    inboundTopic.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowEndUserMessagingPublish',
      principals: [smsService],
      actions: ['sns:Publish'],
      resources: [inboundTopic.topicArn],
      conditions: { StringEquals: { 'aws:SourceAccount': Aws.ACCOUNT_ID } },
    }));
    dataKey.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowEndUserMessagingToUseKeyForSns',
      principals: [smsService],
      actions: ['kms:GenerateDataKey*', 'kms:Decrypt'],
      resources: ['*'],
      conditions: { StringEquals: { 'aws:SourceAccount': Aws.ACCOUNT_ID } },
    }));
    const smsConfigSet = new smsvoice.CfnConfigurationSet(this, 'SmsConfigurationSet', {
      configurationSetName: 'relay-sms',
    });

    // ── Container image (built from relay-app/Dockerfile during `cdk deploy`) ──
    const image = ecs.ContainerImage.fromAsset(path.join(__dirname, '..', '..', 'relay-app'), {
      platform: ecrAssets.Platform.LINUX_ARM64,
    });

    // ── TLS certificate + load balancer + Fargate service ──
    const zone = cfg.hostedZoneId
      ? route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
          hostedZoneId: cfg.hostedZoneId,
          zoneName: cfg.hostedZoneName || cfg.domainName.split('.').slice(-2).join('.'),
        })
      : undefined;
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: cfg.domainName,
      // With a Route 53 zone the DNS check is automatic; otherwise `cdk deploy`
      // waits until you add the CNAME shown in the ACM console at your registrar.
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const albLogs = new s3.Bucket(this, 'LoadBalancerLogs', {
      encryption: s3.BucketEncryption.S3_MANAGED, // ALB access logs require SSE-S3
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(365) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc, clusterName: 'relay' });
    const appLogs = logGroup('app', 'AppLogGroup');

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'App', {
      cluster,
      serviceName: 'relay-app',
      cpu: 256,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      assignPublicIp: true, // outbound only; inbound is limited to the load balancer
      publicLoadBalancer: true,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificate,
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      redirectHTTP: true,
      circuitBreaker: { enable: true, rollback: true }, // bad deploys roll back automatically
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: Duration.seconds(120),
      taskImageOptions: {
        image,
        containerName: 'relay',
        containerPort: 3000,
        logDriver: ecs.LogDrivers.awsLogs({ streamPrefix: 'relay', logGroup: appLogs }),
        environment: {
          APP_URL: appUrl,
          CLINIC_TIMEZONE: cfg.clinicTimeZone,
          DB_HOST: db.dbInstanceEndpointAddress,
          DB_PORT: db.dbInstanceEndpointPort,
          DB_NAME,
          DATABASE_SSL: 'verify',
          DATABASE_SSL_CA_FILE: RDS_CA_PATH,
          MIGRATE_ON_START: 'true',
          AUTH_MODE: 'cognito',
          COGNITO_ISSUER: `https://cognito-idp.${Aws.REGION}.amazonaws.com/${userPool.userPoolId}`,
          COGNITO_CLIENT_ID: appClient.userPoolClientId,
          COGNITO_DOMAIN: `https://${cfg.cognitoDomainPrefix}.auth.${Aws.REGION}.amazoncognito.com`,
          COGNITO_ADMIN_GROUP: 'admin',
          COGNITO_MA_GROUP: 'ma',
          COGNITO_SCOPES: 'openid email profile',
          CLINIC_LOGIN_NAME: cfg.clinicLoginName,
          SESSION_IDLE_MINUTES: '30',
          SESSION_HOURS: '8',
          VOICE_ENABLED: 'false',
          AWS_REGION: Aws.REGION,
          SMS_PROVIDER: 'aws',
          SMS_ORIGINATION_IDENTITY: cfg.smsOriginationIdentity,
          SMS_INBOUND_SNS_TOPIC_ARN: inboundTopic.topicArn,
          SMS_CONFIGURATION_SET: smsConfigSet.attrArn,
          AI_PROVIDER: 'bedrock',
          BEDROCK_MODEL_ID: cfg.bedrockModelId,
          CLINIC_PHONE_NUMBER: cfg.clinicPhoneNumber,
          CLINIC_DISPLAY_NAME: cfg.clinicDisplayName,
        },
        secrets: {
          DB_USER: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
          DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
          AUTH_SECRET: ecs.Secret.fromSecretsManager(authSecret),
          COGNITO_CLIENT_SECRET: ecs.Secret.fromSecretsManager(cognitoClientSecret),
          OUTREACH_CRON_TOKEN: ecs.Secret.fromSecretsManager(outreachToken),
        },
      },
    });
    service.targetGroup.configureHealthCheck({
      path: '/login', // public page; 200 when the server is up
      healthyHttpCodes: '200',
      interval: Duration.seconds(30),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });
    service.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30');
    service.loadBalancer.logAccessLogs(albLogs, 'alb');
    service.loadBalancer.setAttribute('routing.http.drop_invalid_header_fields.enabled', 'true');
    db.connections.allowDefaultPortFrom(service.service, 'Relay app to Postgres');

    if (cfg.subscribeInboundSms) {
      // SNS immediately sends a SubscriptionConfirmation to this URL, so create the
      // subscription only after the app (and its DNS name) is up.
      const inboundSub = inboundTopic.addSubscription(new subs.UrlSubscription(`${appUrl}/api/sms/inbound`, {
        protocol: sns.SubscriptionProtocol.HTTPS,
        deadLetterQueue: inboundDlq,
      }));
      inboundSub.node.addDependency(service.service);
    }

    if (zone) {
      new route53.ARecord(this, 'AppDnsRecord', {
        zone,
        recordName: cfg.domainName,
        target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(service.loadBalancer)),
      });
    }

    // ── What the running app may do in AWS (least privilege) ──
    const taskRole = service.taskDefinition.taskRole;
    taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'SendSms',
      actions: ['sms-voice:SendTextMessage', 'sms-voice:SendRcsMessage'],
      resources: [`arn:${Aws.PARTITION}:sms-voice:${Aws.REGION}:${Aws.ACCOUNT_ID}:*`],
    }));
    taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'InvokeClaudeOnBedrock',
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        `arn:${Aws.PARTITION}:bedrock:*::foundation-model/anthropic.claude-*`,
        `arn:${Aws.PARTITION}:bedrock:${Aws.REGION}:${Aws.ACCOUNT_ID}:inference-profile/*`,
      ],
    }));
    if (cfg.pauseTexting) {
      // Explicit Deny beats every Allow: no texts leave, inbound replies still arrive.
      taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
        sid: 'EmergencyPauseAllTexting',
        effect: iam.Effect.DENY,
        actions: ['sms-voice:SendTextMessage', 'sms-voice:SendMediaMessage', 'sms-voice:SendRcsMessage'],
        resources: ['*'],
      }));
    }

    // ── Outreach tick: Scheduler → Lambda → POST /api/sms/outreach/tick ──
    const tickFn = new lambda.Function(this, 'OutreachTickFn', {
      functionName: 'relay-outreach-tick',
      description: 'Calls Relay /api/sms/outreach/tick with the bearer token',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'outreach-tick')),
      timeout: Duration.seconds(30),
      memorySize: 128,
      reservedConcurrentExecutions: 1, // never two ticks at once
      environment: {
        TICK_URL: `${appUrl}/api/sms/outreach/tick`,
        TOKEN_SECRET_ARN: outreachToken.secretArn,
      },
      environmentEncryption: dataKey,
      logGroup: logGroup('outreach-tick', 'OutreachTickLogGroup'),
    });
    outreachToken.grantRead(tickFn);
    const tickSchedule = new scheduler.Schedule(this, 'OutreachTickSchedule', {
      scheduleName: 'relay-outreach-tick',
      description: 'Outreach tick during clinic hours (the app also enforces quiet hours)',
      schedule: scheduler.ScheduleExpression.expression(cfg.outreachCron, TimeZone.of(cfg.clinicTimeZone)),
      target: new schedulerTargets.LambdaInvoke(tickFn, { retryAttempts: 0, maxEventAge: Duration.minutes(5) }),
      enabled: cfg.outreachEnabled && !cfg.pauseTexting,
    });

    // ── Audit trail of every AWS console/API action ──
    const trailBucket = new s3.Bucket(this, 'CloudTrailLogs', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ expiration: Duration.days(6 * 365 + 2), noncurrentVersionExpiration: Duration.days(30) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });
    new cloudtrail.Trail(this, 'AuditTrail', {
      trailName: 'relay-audit',
      bucket: trailBucket,
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
      enableFileValidation: true,
    });

    // ── Alerts: budgets + alarms → email ──
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'relay-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: cfg.budgetLimitUsd, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        budgetAlert(cfg.alertEmail, 'ACTUAL', (100 * cfg.budgetWarnUsd) / cfg.budgetLimitUsd),
        budgetAlert(cfg.alertEmail, 'ACTUAL', 100),
        budgetAlert(cfg.alertEmail, 'FORECASTED', 100),
      ],
    });

    const opsTopic = new sns.Topic(this, 'OpsAlerts', {
      topicName: 'relay-ops-alerts',
      displayName: 'Relay alerts',
      enforceSSL: true,
    });
    opsTopic.addSubscription(new subs.EmailSubscription(cfg.alertEmail));
    const alarm = (id: string, description: string, metric: cloudwatch.IMetric, threshold: number, periods = 1) => {
      const a = new cloudwatch.Alarm(this, id, {
        alarmName: `relay-${id}`,
        alarmDescription: description,
        metric,
        threshold,
        evaluationPeriods: periods,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      a.addAlarmAction(new cwActions.SnsAction(opsTopic));
    };
    alarm('app-unhealthy', 'Relay app is failing its health check (site may be down)',
      service.targetGroup.metrics.unhealthyHostCount({ period: Duration.minutes(5) }), 1, 2);
    alarm('app-5xx', 'Relay app returned 5 or more server errors in 5 minutes',
      service.targetGroup.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: Duration.minutes(5), statistic: 'Sum' }), 5);
    alarm('outreach-tick-errors', 'The outreach tick failed 3 times in 30 minutes',
      tickFn.metricErrors({ period: Duration.minutes(30), statistic: 'Sum' }), 3);
    alarm('inbound-sms-undelivered', 'Inbound texts could not be delivered to Relay (see the dead-letter queue)',
      inboundDlq.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }), 1);
    alarm('db-cpu-high', 'Database CPU above 80% for 15 minutes',
      db.metricCPUUtilization({ period: Duration.minutes(15) }), 80);
    const lowStorage = new cloudwatch.Alarm(this, 'db-storage-low', {
      alarmName: 'relay-db-storage-low',
      alarmDescription: 'Database has less than 2 GB free',
      metric: db.metricFreeStorageSpace({ period: Duration.minutes(15) }),
      threshold: 2 * 1024 ** 3,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
    });
    lowStorage.addAlarmAction(new cwActions.SnsAction(opsTopic));

    // ── Outputs (printed at the end of `cdk deploy`) ──
    const out = (id: string, value: string, description: string) => new CfnOutput(this, id, { value, description });
    out('AppUrl', appUrl, 'Open this in the browser');
    out('LoadBalancerDns', service.loadBalancer.loadBalancerDnsName,
      zone ? 'Load balancer (Route 53 alias created automatically)' : `Create a CNAME record ${cfg.domainName} → this value at your DNS provider`);
    out('UserPoolId', userPool.userPoolId, 'Cognito user pool: create staff users here');
    out('CognitoSignInDomain', userPoolDomain.baseUrl(), 'Cognito managed login (sign-in page) domain');
    out('CognitoAppClientId', appClient.userPoolClientId, 'Cognito app client used by Relay (relay-web)');
    out('InboundSmsTopicArn', inboundTopic.topicArn, 'Set as the two-way SMS destination on your End User Messaging phone number');
    out('SmsConfigurationSetName', 'relay-sms', 'End User Messaging configuration set');
    out('DatabaseEndpoint', db.dbInstanceEndpointAddress, 'Private: reachable only from inside the VPC');
    out('DatabaseSecretArn', dbSecret.secretArn, 'Database username/password (Secrets Manager)');
    out('AppLogGroupName', appLogs.logGroupName, 'CloudWatch log group for the app');
    out('ClusterName', cluster.clusterName, 'ECS cluster');
    out('ServiceName', service.service.serviceName, 'ECS service');
    out('OutreachScheduleName', tickSchedule.scheduleName, 'EventBridge Scheduler schedule (disable to stop outreach)');
    out('AppTaskRoleName', taskRole.roleName, 'IAM role the app runs as (attach the emergency deny here)');
  }
}

function budgetAlert(email: string, type: 'ACTUAL' | 'FORECASTED', percent: number): budgets.CfnBudget.NotificationWithSubscribersProperty {
  return {
    notification: {
      notificationType: type,
      comparisonOperator: 'GREATER_THAN',
      threshold: Math.round(percent * 100) / 100,
      thresholdType: 'PERCENTAGE',
    },
    subscribers: [{ subscriptionType: 'EMAIL', address: email }],
  };
}

// ── Staff login emails (Cognito) ──
// Cognito sends these as HTML. Required placeholders: {username} and {####}
// (the temporary password / code). Keep under 20,000 characters; subject under 140.

function invitationEmail(appUrl: string, clinic: string): string {
  return [
    `<p>Hello,</p>`,
    `<p>You now have a staff account for <b>Relay</b>, ${clinic}'s referral scheduling console.</p>`,
    `<p><b>Sign in at:</b> <a href="${appUrl}">${appUrl}</a><br>`,
    `<b>Email (username):</b> {username}<br>`,
    `<b>Temporary password:</b> {####}</p>`,
    `<p>The temporary password works for 3 days. When you first sign in you will:</p>`,
    `<ol><li>enter the temporary password,</li><li>choose your own new password, and</li>`,
    `<li>set up an <b>authenticator app</b> on your phone (Google Authenticator, Microsoft Authenticator or similar): scan the QR code and type the 6-digit code.</li></ol>`,
    `<p>After that, each sign-in asks for your password and a code from the app. If the temporary password has expired or you get stuck, ask the clinic administrator.</p>`,
    `<hr><p>Ya tiene una cuenta de personal en <b>Relay</b>. Inicie sesión en <a href="${appUrl}">${appUrl}</a> con su correo ({username}) y la contraseña temporal de arriba (válida por 3 días). Elegirá una contraseña nueva y configurará una aplicación autenticadora en su teléfono.</p>`,
    `<p style="color:#64748b;font-size:12px">This email was sent because the clinic administrator created your account. Do not forward it.</p>`,
  ].join('\n');
}

function verificationEmail(clinic: string): string {
  return [
    `<p>Your Relay verification code is <b>{####}</b></p>`,
    `<p>Enter it on the Relay sign-in page to reset your password. If you didn't ask for this, ignore this email and tell the ${clinic} administrator.</p>`,
    `<p>Su código de verificación de Relay es <b>{####}</b>. Ingréselo en la página de inicio de sesión para restablecer su contraseña.</p>`,
  ].join('\n');
}

/**
 * Managed-login branding (AWS::Cognito::ManagedLoginBranding Settings). Partial on
 * purpose: Cognito uses its defaults for anything not listed. Colors are RRGGBBAA,
 * taken from relay-app/src/app/globals.css (--relay-accent #0d9488, --relay-accent-700
 * #0f766e, --relay-bg #f4f7f8, --relay-ink #0f172a). Text on these pages can't be
 * customized (only localized), so the clinic name lives in the logo image.
 */
function managedLoginSettings(): Record<string, unknown> {
  const accent = '0d9488ff';
  const accentDark = '0f766eff';
  const accentDeep = '115e59ff';
  const ink = '0f172aff';
  const ink2 = '334155ff';
  const ink3 = '64748bff';
  const hairline = 'd2d9ddff';
  return {
    categories: {
      global: {
        colorSchemeMode: 'LIGHT',
        pageHeader: { enabled: false },
        pageFooter: { enabled: false },
        spacingDensity: 'REGULAR',
      },
      form: {
        displayGraphics: true,
        instructions: { enabled: false },
        languageSelector: { enabled: false },
        location: { horizontal: 'CENTER', vertical: 'CENTER' },
        sessionTimerDisplay: 'NONE',
      },
    },
    componentClasses: {
      buttons: { borderRadius: 8.0 },
      input: {
        borderRadius: 8.0,
        lightMode: { defaults: { backgroundColor: 'ffffffff', borderColor: hairline }, placeholderColor: '94a3b8ff' },
      },
      inputLabel: { lightMode: { textColor: ink2 } },
      inputDescription: { lightMode: { textColor: ink3 } },
      focusState: { lightMode: { borderColor: accent } },
      link: { lightMode: { defaults: { textColor: accentDark }, hover: { textColor: accentDeep } } },
      optionControls: {
        lightMode: {
          defaults: { backgroundColor: 'ffffffff', borderColor: hairline },
          selected: { backgroundColor: accent, foregroundColor: 'ffffffff' },
        },
      },
    },
    components: {
      pageBackground: { image: { enabled: false }, lightMode: { color: 'f4f7f8ff' } },
      form: {
        backgroundImage: { enabled: false },
        borderRadius: 10.0,
        lightMode: { backgroundColor: 'ffffffff', borderColor: 'e4e9ecff' },
        logo: { enabled: true, formInclusion: 'IN', location: 'CENTER', position: 'TOP' },
      },
      pageText: { lightMode: { headingColor: ink, bodyColor: ink2, descriptionColor: ink3 } },
      primaryButton: {
        lightMode: {
          defaults: { backgroundColor: accent, textColor: 'ffffffff' },
          hover: { backgroundColor: accentDark, textColor: 'ffffffff' },
          active: { backgroundColor: accentDeep, textColor: 'ffffffff' },
          disabled: { backgroundColor: 'cbd5e1ff', borderColor: 'cbd5e1ff' },
        },
      },
      secondaryButton: {
        lightMode: {
          defaults: { backgroundColor: 'ffffffff', borderColor: accent, textColor: accentDark },
          hover: { backgroundColor: 'f0fdfaff', borderColor: accentDark, textColor: accentDeep },
          active: { backgroundColor: 'ccfbf1ff', borderColor: accentDeep, textColor: accentDeep },
        },
      },
    },
  };
}
