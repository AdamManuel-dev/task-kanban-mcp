/**
 * Zod helper utilities for handling optional properties with exactOptionalPropertyTypes
 * 
 * @module utils/zod-helpers
 * @description Provides utilities to work with Zod schemas when TypeScript's 
 * exactOptionalPropertyTypes is enabled. This ensures optional properties 
 * explicitly include undefined in their type union.
 */

import { z } from 'zod';

/**
 * Creates an optional Zod schema that is compatible with exactOptionalPropertyTypes
 * 
 * @template T - The inner schema type
 * @param {z.ZodType<T>} schema - The inner Zod schema
 * @returns {z.ZodOptional<z.ZodUnion<[z.ZodType<T>, z.ZodUndefined]>>} 
 *          An optional schema that explicitly includes undefined
 * 
 * @example
 * ```typescript
 * // Instead of:
 * const schema = z.object({
 *   name: z.string().optional()
 * });
 * 
 * // Use:
 * const schema = z.object({
 *   name: optionalWithUndefined(z.string())
 * });
 * ```
 */
export function optionalWithUndefined<T>(
  schema: z.ZodType<T>
): z.ZodOptional<z.ZodUnion<[z.ZodType<T>, z.ZodUndefined]>> {
  return z.union([schema, z.undefined()]).optional();
}

/**
 * Transform function for Zod schemas to handle undefined values properly
 * 
 * @template T - The schema output type
 * @param {z.ZodType<T>} schema - The Zod schema to transform
 * @returns {z.ZodEffects<z.ZodType<T>, T | undefined, T | undefined>}
 *          A transformed schema that handles undefined values
 * 
 * @example
 * ```typescript
 * const schema = z.object({
 *   name: withUndefinedTransform(z.string().optional())
 * });
 * ```
 */
export function withUndefinedTransform<T>(
  schema: z.ZodType<T>
): z.ZodEffects<z.ZodType<T>, T | undefined, T | undefined> {
  return schema.transform((val) => val === undefined ? undefined : val);
}

/**
 * Creates a preprocessed optional string that handles empty strings as undefined
 * 
 * @param {z.ZodString} [baseSchema] - Optional base string schema with additional validations
 * @returns {z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>}
 *          A preprocessed optional string schema
 * 
 * @example
 * ```typescript
 * const schema = z.object({
 *   description: optionalString(z.string().max(500))
 * });
 * ```
 */
export function optionalString(
  baseSchema?: z.ZodString
): z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown> {
  const stringSchema = baseSchema || z.string();
  
  return z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) {
        return undefined;
      }
      return val;
    },
    stringSchema.optional()
  );
}

/**
 * Creates an object schema with all optional properties properly typed for exactOptionalPropertyTypes
 * 
 * @template T - The shape of the object schema
 * @param {T} shape - The object shape definition
 * @returns {z.ZodObject<T>} An object schema with properly typed optional properties
 * 
 * @example
 * ```typescript
 * const UpdateSchema = createOptionalSchema({
 *   name: z.string().min(1).max(100),
 *   description: z.string().max(500),
 *   priority: z.number().int().min(0).max(10)
 * });
 * ```
 */
export function createOptionalSchema<T extends z.ZodRawShape>(
  shape: T
): z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }> {
  const optionalShape = {} as { [K in keyof T]: z.ZodOptional<T[K]> };
  
  for (const key in shape) {
    if (shape.hasOwnProperty(key)) {
      (optionalShape as any)[key] = shape[key]?.optional();
    }
  }
  
  return z.object(optionalShape);
}

/**
 * Helper to create update schemas where all fields are optional
 * and properly handle undefined values for exactOptionalPropertyTypes
 * 
 * @template T - The shape of the create schema
 * @param {z.ZodObject<T>} createSchema - The create schema to base the update schema on
 * @returns {z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }>}
 *          An update schema with all fields optional
 * 
 * @example
 * ```typescript
 * const CreateTaskSchema = z.object({
 *   title: z.string().min(1),
 *   description: z.string(),
 *   priority: z.number()
 * });
 * 
 * const UpdateTaskSchema = createUpdateSchema(CreateTaskSchema);
 * ```
 */
export function createUpdateSchema<T extends z.ZodRawShape>(
  createSchema: z.ZodObject<T>
): z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }> {
  const shape = createSchema.shape;
  return createOptionalSchema(shape);
}

/**
 * Utility type to extract the inferred type from a Zod schema with proper optional handling
 * 
 * @template T - The Zod schema type
 */
export type InferWithOptionals<T extends z.ZodType> = {
  [K in keyof z.infer<T>]?: z.infer<T>[K] | undefined;
};

/**
 * Create a schema preprocessor that filters out undefined values from objects
 * 
 * @template T - The schema type
 * @param {z.ZodType<T>} schema - The schema to preprocess
 * @returns {z.ZodEffects<z.ZodType<T>, T, unknown>} A preprocessed schema
 * 
 * @example
 * ```typescript
 * const schema = filterUndefined(z.object({
 *   name: z.string().optional(),
 *   age: z.number().optional()
 * }));
 * ```
 */
export function filterUndefined<T>(
  schema: z.ZodType<T>
): z.ZodEffects<z.ZodType<T>, T, unknown> {
  return z.preprocess((obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    
    const filtered: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        filtered[key] = value;
      }
    }
    return filtered;
  }, schema);
}

/**
 * Create a partial schema where all properties are optional and handle undefined
 * 
 * @template T - The shape of the schema
 * @param {z.ZodObject<T>} schema - The schema to make partial
 * @returns {z.ZodObject<{ [K in keyof T]?: z.ZodOptional<T[K]> }>} A partial schema
 * 
 * @example
 * ```typescript
 * const FullSchema = z.object({
 *   id: z.string(),
 *   name: z.string(),
 *   age: z.number()
 * });
 * 
 * const PartialSchema = createPartialSchema(FullSchema);
 * ```
 */
export function createPartialSchema<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): ReturnType<typeof schema.partial> {
  return schema.partial();
}