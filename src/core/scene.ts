// Adapted from dsh-diagram v0.6.1 (MIT). See REUSE.md.
import { z } from "zod";
import {SCENE_LIMITS} from "./limits.ts";
export interface ScenePolicy { maxSceneBytes: number; maxSceneElements: number; maxElementTextChars: number }
export const scenePolicy: ScenePolicy = SCENE_LIMITS;
/** JSON data accepted by persisted scene fields. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Editable Excalidraw primitives accepted by durable storage. */
export const EDITABLE_SCENE_ELEMENT_TYPES = [
  "rectangle",
  "diamond",
  "ellipse",
  "line",
  "arrow",
  "freedraw",
  "text",
] as const;

/** Non-configurable limits that prevent hostile scene data from exhausting parsers. */
export const SCENE_PROTOCOL_SECURITY_LIMITS = Object.freeze({
  maxJsonDepth: 64,
  maxJsonValues: 100_000,
  maxAbsoluteJsonNumber: 1_000_000_000_000_000,
  maxAbsoluteElementExtensionNumber: 1_000_000_000,
  maxAbsoluteCoordinate: 1_000_000_000,
  maxAbsoluteAngle: Math.PI * 2,
  maxElementStrokeWidth: 10_000,
  maxElementRoughness: 100,
  maxElementFontSize: 10_000,
  maxElementLineHeight: 100,
  maxElementSeed: 2_147_483_647,
  maxElementIdChars: 256,
  maxElementPoints: 10_000,
  maxElementReferences: 1_000,
});

type JsonInspection =
  | { ok: true; bytes: number }
  | { ok: false; message: string };

interface JsonStackEntry {
  value: unknown;
  depth: number;
}

function inspectJsonTree(
  root: unknown,
  maxBytes: number,
  maxAbsoluteNumber: number,
): JsonInspection {
  const stack: JsonStackEntry[] = [{ value: root, depth: 0 }];
  const seen = new Set<object>();
  let bytes = 0;
  let values = 0;

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) break;
    values += 1;
    if (values > SCENE_PROTOCOL_SECURITY_LIMITS.maxJsonValues) {
      return { ok: false, message: "JSON value count exceeds protocol limit" };
    }
    if (entry.depth > SCENE_PROTOCOL_SECURITY_LIMITS.maxJsonDepth) {
      return { ok: false, message: "JSON nesting exceeds protocol limit" };
    }

    const value = entry.value;
    if (value === null) {
      bytes += 4;
    } else if (typeof value === "boolean") {
      bytes += value ? 4 : 5;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value) || Math.abs(value) > maxAbsoluteNumber) {
        return { ok: false, message: "JSON number exceeds protocol limit" };
      }
      bytes += String(value).length;
    } else if (typeof value === "string") {
      bytes += jsonStringBytes(value);
    } else if (typeof value === "object") {
      if (seen.has(value)) {
        return {
          ok: false,
          message: "JSON data must not contain aliases or cycles",
        };
      }
      seen.add(value);
      let isArray: boolean;
      try {
        isArray = Array.isArray(value);
      } catch {
        return { ok: false, message: "JSON value inspection failed" };
      }
      if (isArray) {
        let prototype: object | null;
        let keys: (string | symbol)[];
        let length: number;
        try {
          prototype = Object.getPrototypeOf(value) as object | null;
          keys = Reflect.ownKeys(value);
          length = (value as unknown[]).length;
        } catch {
          return { ok: false, message: "JSON array inspection failed" };
        }
        if (prototype !== Array.prototype) {
          return { ok: false, message: "JSON arrays must be plain arrays" };
        }
        if (
          length > SCENE_PROTOCOL_SECURITY_LIMITS.maxJsonValues - values ||
          keys.length !== length + 1
        ) {
          return {
            ok: false,
            message: "JSON array exceeds protocol limit or has holes",
          };
        }
        bytes += 2 + Math.max(0, length - 1);
        for (const key of keys) {
          if (key === "length") continue;
          if (typeof key !== "string") {
            return { ok: false, message: "JSON array keys must be indices" };
          }
          const index = Number(key);
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= length ||
            String(index) !== key
          ) {
            return { ok: false, message: "JSON array keys must be indices" };
          }
          let descriptor: PropertyDescriptor | undefined;
          try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
          } catch {
            return { ok: false, message: "JSON array inspection failed" };
          }
          if (
            descriptor === undefined ||
            !("value" in descriptor) ||
            descriptor.enumerable !== true
          ) {
            return {
              ok: false,
              message: "JSON array entries must be enumerable values",
            };
          }
          stack.push({ value: descriptor.value, depth: entry.depth + 1 });
        }
      } else {
        let prototype: object | null;
        let keys: (string | symbol)[];
        try {
          prototype = Object.getPrototypeOf(value) as object | null;
          keys = Reflect.ownKeys(value);
        } catch {
          return { ok: false, message: "JSON object inspection failed" };
        }
        if (prototype !== Object.prototype && prototype !== null) {
          return { ok: false, message: "JSON objects must be plain objects" };
        }
        bytes += 2 + Math.max(0, keys.length - 1);
        for (const key of keys) {
          if (typeof key !== "string") {
            return { ok: false, message: "JSON object keys must be strings" };
          }
          let descriptor: PropertyDescriptor | undefined;
          try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
          } catch {
            return { ok: false, message: "JSON object inspection failed" };
          }
          if (
            descriptor === undefined ||
            !("value" in descriptor) ||
            descriptor.enumerable !== true
          ) {
            return {
              ok: false,
              message: "JSON object properties must be enumerable values",
            };
          }
          bytes += jsonStringBytes(key) + 1;
          stack.push({ value: descriptor.value, depth: entry.depth + 1 });
        }
      }
    } else {
      return { ok: false, message: "Value is not plain JSON" };
    }

    if (bytes > maxBytes) {
      return { ok: false, message: `JSON exceeds ${maxBytes} bytes` };
    }
  }

  return { ok: true, bytes };
}

function jsonStringBytes(value: string): number {
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) {
      bytes += 2;
    } else if (code <= 0x1f) {
      bytes += code === 0x08 || code === 0x09 || code === 0x0a
        || code === 0x0c || code === 0x0d ? 2 : 6;
    } else if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      bytes += 6;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function createJsonValueSchema(maxBytes: number, maxAbsoluteNumber: number) {
  return z
    .unknown()
    .superRefine((value, context) => {
      const inspection = inspectJsonTree(
        value,
        maxBytes,
        maxAbsoluteNumber,
      );
      if (!inspection.ok) {
        context.addIssue({ code: "custom", message: inspection.message });
      }
    })
    .transform((value) => value as JsonValue);
}

/**
 * Creates the schema for an editable scene crossing RPC or durable-data inputs.
 *
 * The schema preserves JSON-only Excalidraw fields while rejecting element
 * types and fields that can load external or embedded content.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A strict persisted-scene schema.
 */
export function createSceneSchema(
  policy: Readonly<ScenePolicy>,
) {
  const securityLimits = SCENE_PROTOCOL_SECURITY_LIMITS;
  const boundedNumber = z
    .number()
    .min(-securityLimits.maxAbsoluteCoordinate)
    .max(securityLimits.maxAbsoluteCoordinate);
  const boundedNonNegativeNumber = z
    .number()
    .min(0)
    .max(securityLimits.maxAbsoluteCoordinate);
  const boundedText = z.string().max(policy.maxElementTextChars);
  const elementIdSchema = z
    .string()
    .min(1)
    .max(securityLimits.maxElementIdChars);
  const pointSchema = z.tuple([boundedNumber, boundedNumber]);
  const paintSchema = z
    .string()
    .regex(
      /^(?:transparent|#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8}))$/iu,
      "Paint must be transparent or a hexadecimal color",
    );
  const jsonValueSchema = createJsonValueSchema(
    policy.maxSceneBytes,
    securityLimits.maxAbsoluteElementExtensionNumber,
  );
  const metadataJsonValueSchema = createJsonValueSchema(
    policy.maxSceneBytes,
    securityLimits.maxAbsoluteJsonNumber,
  );
  const nonNegativeSafeIntegerSchema = z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER);
  const roundnessSchema = z
    .object({
      type: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      value: boundedNonNegativeNumber.optional(),
    })
    .strict();
  const arrowheadSchema = z.enum([
    "arrow",
    "bar",
    "dot",
    "circle",
    "circle_outline",
    "triangle",
    "triangle_outline",
    "diamond",
    "diamond_outline",
    "crowfoot_one",
    "crowfoot_many",
    "crowfoot_one_or_many",
  ]);
  const bindingSchema = z
    .object({
      elementId: elementIdSchema,
      focus: boundedNumber.optional(),
      gap: boundedNonNegativeNumber.optional(),
      fixedPoint: pointSchema.optional(),
    })
    .strict()
    .superRefine((binding, context) => {
      if (binding.focus === undefined) {
        context.addIssue({
          code: "custom",
          message: "Binding focus is required",
          path: ["focus"],
        });
      }
      if (binding.gap === undefined) {
        context.addIssue({
          code: "custom",
          message: "Binding gap is required",
          path: ["gap"],
        });
      }
    })
    .transform((binding) => binding as unknown as JsonValue);
  const boundElementSchema = z
    .object({
      id: elementIdSchema,
      type: z.enum(["arrow", "text"]),
    })
    .strict();
  const fixedSegmentSchema = z
    .object({
      start: pointSchema,
      end: pointSchema,
      index: z
        .number()
        .int()
        .nonnegative()
        .max(securityLimits.maxElementPoints),
    })
    .strict();
  const elementSchema = z
    .object({
      id: elementIdSchema,
      type: z.enum(EDITABLE_SCENE_ELEMENT_TYPES),
      x: boundedNumber,
      y: boundedNumber,
      width: boundedNonNegativeNumber,
      height: boundedNonNegativeNumber,
      angle: z
        .number()
        .min(-securityLimits.maxAbsoluteAngle)
        .max(securityLimits.maxAbsoluteAngle)
        .optional(),
      link: z.null().optional(),
      strokeColor: paintSchema.optional(),
      backgroundColor: paintSchema.optional(),
      fillStyle: z
        .enum(["hachure", "cross-hatch", "solid", "zigzag"])
        .optional(),
      strokeWidth: z
        .number()
        .min(0)
        .max(securityLimits.maxElementStrokeWidth)
        .optional(),
      strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
      roughness: z
        .number()
        .min(0)
        .max(securityLimits.maxElementRoughness)
        .optional(),
      opacity: z.number().min(0).max(100).optional(),
      roundness: roundnessSchema.nullable().optional(),
      seed: z
        .number()
        .int()
        .nonnegative()
        .max(securityLimits.maxElementSeed)
        .optional(),
      version: nonNegativeSafeIntegerSchema.optional(),
      versionNonce: nonNegativeSafeIntegerSchema.optional(),
      updated: z
        .number()
        .int()
        .nonnegative()
        .max(securityLimits.maxAbsoluteJsonNumber)
        .optional(),
      index: z.string().nullable().optional(),
      isDeleted: z.boolean().optional(),
      locked: z.boolean().optional(),
      text: boundedText.optional(),
      originalText: boundedText.nullable().optional(),
      rawText: boundedText.optional(),
      fontSize: z
        .number()
        .positive()
        .max(securityLimits.maxElementFontSize)
        .optional(),
      fontFamily: z.number().int().positive().max(1_000).optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
      verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
      autoResize: z.boolean().optional(),
      lineHeight: z
        .number()
        .positive()
        .max(securityLimits.maxElementLineHeight)
        .optional(),
      customData: metadataJsonValueSchema.optional(),
      groupIds: z
        .array(elementIdSchema)
        .max(securityLimits.maxElementReferences)
        .optional(),
      frameId: elementIdSchema.nullable().optional(),
      containerId: elementIdSchema.nullable().optional(),
      boundElements: z
        .array(boundElementSchema)
        .max(securityLimits.maxElementReferences)
        .nullable()
        .optional(),
      points: z
        .array(pointSchema)
        .max(securityLimits.maxElementPoints)
        .optional(),
      pressures: z
        .array(z.number().min(0).max(1))
        .max(securityLimits.maxElementPoints)
        .optional(),
      simulatePressure: z.boolean().optional(),
      lastCommittedPoint: pointSchema.nullable().optional(),
      startBinding: bindingSchema.nullable().optional(),
      endBinding: bindingSchema.nullable().optional(),
      startArrowhead: arrowheadSchema.nullable().optional(),
      endArrowhead: arrowheadSchema.nullable().optional(),
      elbowed: z.boolean().optional(),
      fixedSegments: z
        .array(fixedSegmentSchema)
        .max(securityLimits.maxElementReferences)
        .nullable()
        .optional(),
      startIsSpecial: z.boolean().nullable().optional(),
      endIsSpecial: z.boolean().nullable().optional(),
    })
    .catchall(jsonValueSchema)
    .superRefine((element, context) => {
      if (
        (element.type === "line" || element.type === "arrow") &&
        (element.points === undefined || element.points.length < 2)
      ) {
        context.addIssue({
          code: "custom",
          message: `${element.type} elements require at least two points`,
          path: ["points"],
        });
      }
      if (
        element.type === "freedraw" &&
        (element.points === undefined || element.points.length < 1)
      ) {
        context.addIssue({
          code: "custom",
          message: "freedraw elements require at least one point",
          path: ["points"],
        });
      }
      if (element.type === "text" && element.text === undefined) {
        context.addIssue({
          code: "custom",
          message: "text elements require bounded text",
          path: ["text"],
        });
      }
    });
  const appStateSchema = z
    .object({
      viewBackgroundColor: paintSchema.optional(),
      gridSize: boundedNonNegativeNumber.positive().nullable().optional(),
      gridStep: boundedNonNegativeNumber.positive().optional(),
      gridModeEnabled: z.boolean().optional(),
      theme: z.enum(["light", "dark"]).optional(),
    })
    .strict();

  const sceneSchema = z
    .object({
      elements: z.array(elementSchema).max(policy.maxSceneElements),
      appState: appStateSchema,
      files: z
        .record(z.string(), metadataJsonValueSchema)
        .refine((files) => Object.keys(files).length === 0, {
          message: "Persisted scene files must be empty",
        }),
    })
    .strict()
    .superRefine((scene, context) => {
      const elementIds = new Set<string>();
      const elementsById = new Map(
        scene.elements.map((element) => [element.id, element] as const),
      );
      for (const [index, element] of scene.elements.entries()) {
        if (elementIds.has(element.id)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate scene element id: ${element.id}`,
            path: ["elements", index, "id"],
          });
        }
        elementIds.add(element.id);

        if (element.frameId !== undefined && element.frameId !== null) {
          context.addIssue({
            code: "custom",
            message: "frameId must be null because frame elements are unsupported",
            path: ["elements", index, "frameId"],
          });
        }

        const references: [
          id: string | undefined,
          path: (string | number)[],
        ][] = [
          [
            bindingElementId(element.startBinding),
            ["elements", index, "startBinding", "elementId"],
          ],
          [
            bindingElementId(element.endBinding),
            ["elements", index, "endBinding", "elementId"],
          ],
          [
            element.containerId ?? undefined,
            ["elements", index, "containerId"],
          ],
        ];
        for (const [referenceId, path] of references) {
          if (referenceId !== undefined && !elementsById.has(referenceId)) {
            context.addIssue({
              code: "custom",
              message: `Unknown scene element id: ${referenceId}`,
              path,
            });
          }
        }
        for (const [boundIndex, boundElement] of (
          element.boundElements ?? []
        ).entries()) {
          const referencedElement = elementsById.get(boundElement.id);
          if (referencedElement === undefined) {
            context.addIssue({
              code: "custom",
              message: `Unknown scene element id: ${boundElement.id}`,
              path: ["elements", index, "boundElements", boundIndex, "id"],
            });
          } else if (referencedElement.type !== boundElement.type) {
            context.addIssue({
              code: "custom",
              message: `Bound element type does not match ${boundElement.id}`,
              path: ["elements", index, "boundElements", boundIndex, "type"],
            });
          }
        }
      }
    });

  return z
    .unknown()
    .superRefine((scene, context) => {
      const inspection = inspectJsonTree(
        scene,
        policy.maxSceneBytes,
        securityLimits.maxAbsoluteJsonNumber,
      );
      if (!inspection.ok) {
        context.addIssue({
          code: "custom",
          message: inspection.message,
          path: [],
        });
      }
    })
    .pipe(sceneSchema);
}

function bindingElementId(
  value: JsonValue | null | undefined,
): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const elementId = value.elementId;
  return typeof elementId === "string" ? elementId : undefined;
}

/** A validated, editable scene whose elements are the current diagram state. */
export type PersistedScene = z.infer<ReturnType<typeof createSceneSchema>>;
