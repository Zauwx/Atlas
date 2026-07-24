import { z } from "zod";
import { Z_MAX, Z_MIN } from "../board/coordinates.js";
import { MapIdSchema, TerrainIdSchema } from "../ids.js";

/**
 * Map definition — the static board a match is created from.
 *
 * DETERMINISM: `cells` is row-major (y ascending, then x ascending), the
 * same canonical order as BoardSnapshot, so cell (x, y) lives at index
 * y × width + x.
 */
export const MapCellSchema = z.object({
  z: z.number().int().min(Z_MIN).max(Z_MAX),
  terrainId: TerrainIdSchema,
});
export type MapCell = z.infer<typeof MapCellSchema>;

export const MapConfigSchema = z
  .object({
    id: MapIdSchema,
    name: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    cells: z.array(MapCellSchema),
  })
  .refine((map) => map.cells.length === map.width * map.height, {
    message: "cells length must equal width × height",
  });
export type MapConfig = z.infer<typeof MapConfigSchema>;
