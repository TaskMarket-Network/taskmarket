import {
  AGENT_REGISTRATION_API_VERSION,
  type AgentRegistrationRequest,
} from '@taskmarket/agent-registry';
import { getDashboardPrincipal } from '../env.js';
import { newRequestId } from '../request-id.js';
import {
  buildCreateAgentInput,
  buildUpdateInput,
  type CreateAgentForm,
  type EditAgentForm,
} from '../validate.js';

/**
 * Build the wire envelope for a registration operation. The principal is the
 * dashboard's development identity, and `ownerRef` is forced to match it so
 * the ownership authorization boundary is always exercised.
 */

function baseRequest(
  action: AgentRegistrationRequest['action'],
  principal: string,
): AgentRegistrationRequest {
  return {
    contractVersion: AGENT_REGISTRATION_API_VERSION,
    requestId: newRequestId(),
    action,
    principal,
    payload: {},
  };
}

export function buildRegisterRequest(form: CreateAgentForm): AgentRegistrationRequest {
  const principal = getDashboardPrincipal();
  const parsed = buildCreateAgentInput(form);
  const request = baseRequest('register', principal);
  if (parsed.input === null) {
    throw new Error('Cannot build a register request from invalid form input.');
  }
  request.payload = { ...parsed.input, ownerRef: principal };
  return request;
}

export function buildUpdateRequest(
  agentId: string,
  version: number,
  form: EditAgentForm,
): AgentRegistrationRequest {
  const principal = getDashboardPrincipal();
  const parsed = buildUpdateInput(form);
  const request = baseRequest('update', principal);
  if (parsed.update === null) {
    throw new Error('Cannot build an update request from invalid form input.');
  }
  request.payload = { agentId, version, update: parsed.update };
  return request;
}

export function buildDisableRequest(agentId: string, version: number): AgentRegistrationRequest {
  const principal = getDashboardPrincipal();
  const request = baseRequest('disable', principal);
  request.payload = { agentId, version };
  return request;
}
