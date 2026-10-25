/**
 * A tool an agent may call, as data: name, what it is for, the right it needs, its input and the
 * function that answers. Descriptions are in English, the language agents read best; the data
 * stays as it is, mostly German.
 */
import { z } from "zod";
import { fromLocal } from "@/lib/jscalendar";
import type { Scope } from "./connections";
import type { Reader } from "./reader";
import type { Writer } from "./writer";

export type ToolContext = { reader: Reader; writer: Writer };

export type Tool<S extends z.ZodRawShape = z.ZodRawShape> = {
  name: string;
  title: string;
  description: string;
  /** "read" tools only look; "write" tools create or change and are logged. */
  scope: Scope;
  input: S;
  run: (context: ToolContext, input: z.infer<z.ZodObject<S>>) => Promise<unknown>;
};

export const tool = <S extends z.ZodRawShape>(definition: Tool<S>) => definition;

export const DAY = 86_400_000;

export const accountId = z
  .string()
  .optional()
  .describe("Only this account (an id from list_accounts); all accounts when left out.");

export const limit = (fallback: number, max: number) =>
  z.number().int().min(1).max(max).default(fallback).describe("How many results at most.");

/** "2026-10-25" (start of that day in Germany) or a full ISO time. */
export const instant = (value: string): Date => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? fromLocal(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Kein Datum: ${value}`);
  return date;
};
