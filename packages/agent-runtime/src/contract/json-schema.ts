import { z } from 'zod';

import { AgentRuntimeError, AGENT_RUNTIME_CONTRACT_ERROR_CODES } from '../errors.js';

/** Minimal JSON Schema value (OpenAPI 3.1-compatible subset). */
export type JsonSchema = Record<string, unknown>;

function stringToJsonSchema(schema: z.ZodString): JsonSchema {
  const result: JsonSchema = { type: 'string' };
  for (const check of schema._def.checks) {
    switch (check.kind) {
      case 'regex':
        result.pattern = check.regex.source;
        break;
      case 'min':
        result.minLength = check.value;
        break;
      case 'max':
        result.maxLength = check.value;
        break;
      case 'email':
        result.format = 'email';
        break;
      case 'url':
        result.format = 'uri';
        break;
      case 'uuid':
        result.format = 'uuid';
        break;
      default:
        break;
    }
  }
  return result;
}

function objectToJsonSchema(
  schema: z.ZodObject<z.ZodRawShape, 'strip' | 'passthrough' | 'strict'>,
): JsonSchema {
  const shape = schema.shape as Record<string, z.ZodType>;
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    properties[key] = zodToJsonSchema(field);
    if (!field.isOptional()) {
      required.push(key);
    }
  }

  const result: JsonSchema = { type: 'object', properties };
  if (required.length > 0) {
    result.required = required;
  }
  const unknownKeys = schema._def.unknownKeys;
  if (unknownKeys === 'strict') {
    result.additionalProperties = false;
  } else if (unknownKeys === 'passthrough') {
    result.additionalProperties = true;
  }
  return result;
}

/**
 * Convert a Zod schema into a JSON Schema (OpenAPI 3.1-compatible) for API
 * documentation generation. Throws {@link AgentRuntimeError} for schema kinds
 * that are not supported so documentation never silently goes stale.
 */
export function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def.innerType);
  }
  if (schema instanceof z.ZodNullable) {
    return zodToJsonSchema(schema._def.innerType);
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema._def.innerType);
  }
  if (schema instanceof z.ZodEffects) {
    return zodToJsonSchema(schema._def.schema);
  }
  if (schema instanceof z.ZodString) {
    return stringToJsonSchema(schema);
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: [...schema._def.values] };
  }
  if (schema instanceof z.ZodNativeEnum) {
    return { type: 'string', enum: [...Object.values(schema._def.values)] };
  }
  if (schema instanceof z.ZodLiteral) {
    return { const: schema._def.value };
  }
  if (schema instanceof z.ZodNumber) {
    const result: JsonSchema = schema.isInt ? { type: 'integer' } : { type: 'number' };
    for (const check of schema._def.checks) {
      if (check.kind === 'min') {
        if (check.inclusive) {
          result.minimum = check.value;
        } else {
          result.exclusiveMinimum = check.value;
        }
      } else if (check.kind === 'max') {
        if (check.inclusive) {
          result.maximum = check.value;
        } else {
          result.exclusiveMaximum = check.value;
        }
      }
    }
    return result;
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  if (schema instanceof z.ZodObject) {
    return objectToJsonSchema(schema);
  }
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema(schema._def.type) };
  }
  if (schema instanceof z.ZodRecord) {
    return { type: 'object', additionalProperties: zodToJsonSchema(schema._def.valueType) };
  }
  if (schema instanceof z.ZodNull) {
    return { type: 'null' };
  }
  if (schema instanceof z.ZodUnion) {
    return { anyOf: schema._def.options.map((option: z.ZodType) => zodToJsonSchema(option)) };
  }
  if (schema instanceof z.ZodDiscriminatedUnion) {
    return { anyOf: schema._def.options.map((option: z.ZodType) => zodToJsonSchema(option)) };
  }
  if (schema instanceof z.ZodUnknown || schema instanceof z.ZodAny) {
    return {};
  }

  throw new AgentRuntimeError(
    AGENT_RUNTIME_CONTRACT_ERROR_CODES.SCHEMA_UNSUPPORTED,
    `Cannot convert Zod schema of type ${schema.constructor.name} to JSON Schema.`,
  );
}
