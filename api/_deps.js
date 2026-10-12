import OpenAI from 'openai';
import { authenticate, authenticatedDatabaseClient } from './_auth.js';
import { consumeRequestQuota } from './_rate-limit.js';
import { loadAthleteContext } from './_athlete-context.js';

// Single injectable seam so handlers can be exercised without network access.
//
// The overrides below are a test-only affordance: `authenticate` decides who may spend a
// paid provider call, so in a production environment replacing it must not be possible from
// anywhere in the module graph. Handlers deliberately do NOT re-export `__setDeps`, so the
// seam is reachable only by a test importing this module directly.
const defaults = {
  authenticate,
  databaseClient: authenticatedDatabaseClient,
  consumeRequestQuota,
  loadAthleteContext,
  createAiClient: (options) => new OpenAI(options),
};

export const deps = { ...defaults };

function assertTestOnly() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dependency overrides are only permitted when NODE_ENV=test.');
  }
}

export function __setDeps(overrides = {}) {
  assertTestOnly();
  Object.assign(deps, overrides);
}

export function __resetDeps() {
  assertTestOnly();
  Object.assign(deps, defaults);
}
