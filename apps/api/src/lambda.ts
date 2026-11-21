import { handle } from 'hono/aws-lambda';
import { buildApp } from './server';

// Built once per Lambda container, reused across requests.
export const handler = handle(buildApp());
