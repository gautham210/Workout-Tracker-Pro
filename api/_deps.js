import OpenAI from 'openai';
import { authenticate, authenticatedDatabaseClient } from './_auth.js';
import { consumeRequestQuota } from './_rate-limit.js';
import { loadAthleteContext } from './_athlete-context.js';

// Single injectable seam so handlers can be exercised without network access.
const defaults = {
  authenticate,
  databaseClient: authenticatedDatabaseClient,
  consumeRequestQuota,
  loadAthleteContext,
  createAiClient: (options) => new OpenAI(options),
};

export const deps = { ...defaults };
export function __setDeps(overrides = {}) { Object.assign(deps, overrides); }
export function __resetDeps() { Object.assign(deps, defaults); }
