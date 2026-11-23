/**
 * tsx scripts/check-release.ts [version]   (after `cdk synth RacketClub -c release=true`)
 *
 * The Launch Stack template must deploy into a brand-new account: no `cdk bootstrap`, so every
 * Lambda bundle, layer and web asset has to come from the public release bucket under this
 * version's prefix, and the web app must be in it.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const version = process.argv[2] ?? process.env.RELEASE_VERSION ?? '0.1.0';
// biome-ignore lint/suspicious/noTemplateCurlyInString: the template's own Fn::Sub string
const RELEASE_BUCKET = 'racket-club-releases-${AWS::Region}';
const template = JSON.parse(
  readFileSync(join(resolve('cdk.out'), 'RacketClub.template.json'), 'utf8'),
) as {
  Description?: string;
  Parameters?: Record<string, unknown>;
  Rules?: Record<string, unknown>;
  Resources: Record<string, { Type: string; Properties?: Record<string, unknown> }>;
};

const problems: string[] = [];
const text = JSON.stringify(template);

if (/cdk-[a-z0-9]{9}-/.test(text)) problems.push('references a CDK bootstrap resource');
if (template.Parameters?.BootstrapVersion || template.Rules?.CheckBootstrapVersion) {
  problems.push('requires a CDK bootstrap version');
}
if (!template.Description?.includes(version)) {
  problems.push(`description doesn't name version ${version}`);
}

let code = 0;
for (const [id, r] of Object.entries(template.Resources)) {
  const c = (r.Properties?.Code ?? r.Properties?.Content) as
    | { S3Bucket?: unknown; S3Key?: unknown; ZipFile?: unknown }
    | undefined;
  if (!c || c.ZipFile) continue;
  code++;
  const bucket = (c.S3Bucket as { 'Fn::Sub'?: string } | undefined)?.['Fn::Sub'];
  if (bucket !== RELEASE_BUCKET) problems.push(`${id}: code not in the release bucket`);
  if (typeof c.S3Key !== 'string' || !c.S3Key.startsWith(`v${version}/`)) {
    problems.push(`${id}: code key not under v${version}/`);
  }
}
if (code === 0) problems.push('no Lambda code found');

const web = Object.values(template.Resources).filter(
  (r) => r.Type === 'Custom::CDKBucketDeployment',
);
if (web.length !== 1) problems.push('web app missing: build apps/web before synth');

if (problems.length) {
  for (const p of problems) console.error(`FAIL  ${p}`);
  process.exit(1);
}
console.log(
  `ok    release template v${version}: ${code} bundles from ${RELEASE_BUCKET}, web app included`,
);
