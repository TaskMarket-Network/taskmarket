import type {
  MarketplaceCatalogRequest,
  MarketplaceCatalogUpdatePayload,
  MarketplaceListingInput,
  ServiceOfferingInput,
  ServiceOfferingRequest,
  ServiceOfferingUpdatePayload,
} from '@taskmarket/catalog';
import { MARKETPLACE_CATALOG_API_VERSION, SERVICE_OFFERING_API_VERSION } from '@taskmarket/catalog';

import { getDashboardPrincipal } from '../env.js';
import { newRequestId } from '../request-id.js';

/**
 * Build the wire envelopes for marketplace catalog operations. The principal is
 * the dashboard's development identity, and `ownerRef` is forced to match it so
 * the ownership authorization boundary is always exercised.
 */

function baseCatalogRequest(
  action: MarketplaceCatalogRequest['action'],
  principal: string,
): MarketplaceCatalogRequest {
  return {
    contractVersion: MARKETPLACE_CATALOG_API_VERSION,
    requestId: newRequestId(),
    action,
    principal,
    payload: {},
  };
}

export function buildCreateListingRequest(
  input: MarketplaceListingInput,
): MarketplaceCatalogRequest {
  const principal = getDashboardPrincipal();
  const request = baseCatalogRequest('create', principal);
  request.payload = { input: { ...input, ownerRef: principal } };
  return request;
}

export function buildUpdateListingRequest(
  listingId: string,
  version: number,
  update: MarketplaceCatalogUpdatePayload['update'],
): MarketplaceCatalogRequest {
  const principal = getDashboardPrincipal();
  const request = baseCatalogRequest('update', principal);
  request.payload = { listingId, version, update };
  return request;
}

export function buildListingLifecycleRequest(
  action: 'publish' | 'pause' | 'delist',
  listingId: string,
  version: number,
): MarketplaceCatalogRequest {
  const principal = getDashboardPrincipal();
  const request = baseCatalogRequest(action, principal);
  request.payload = { listingId, version };
  return request;
}

function baseOfferingRequest(
  action: ServiceOfferingRequest['action'],
  principal: string,
): ServiceOfferingRequest {
  return {
    contractVersion: SERVICE_OFFERING_API_VERSION,
    requestId: newRequestId(),
    action,
    principal,
    payload: {},
  };
}

export function buildCreateOfferingRequest(input: ServiceOfferingInput): ServiceOfferingRequest {
  const principal = getDashboardPrincipal();
  const request = baseOfferingRequest('create', principal);
  request.payload = { input: { ...input, ownerRef: principal } };
  return request;
}

export function buildUpdateOfferingRequest(
  offeringId: string,
  version: number,
  update: ServiceOfferingUpdatePayload['update'],
): ServiceOfferingRequest {
  const principal = getDashboardPrincipal();
  const request = baseOfferingRequest('update', principal);
  request.payload = { offeringId, version, update };
  return request;
}

export function buildOfferingLifecycleRequest(
  action: 'archive' | 'activate',
  offeringId: string,
  version: number,
): ServiceOfferingRequest {
  const principal = getDashboardPrincipal();
  const request = baseOfferingRequest(action, principal);
  request.payload = { offeringId, version };
  return request;
}
