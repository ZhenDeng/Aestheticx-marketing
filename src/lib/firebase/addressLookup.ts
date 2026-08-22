"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "./client";

export interface AddressPrediction {
  placeId: string;
  label: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function predictionsFrom(data: unknown): AddressPrediction[] {
  const predictions = asRecord(data)?.predictions;
  if (!Array.isArray(predictions)) return [];

  return predictions.flatMap((prediction) => {
    const record = asRecord(prediction);
    if (typeof record?.placeId !== "string" || typeof record.label !== "string") return [];

    const placeId = record.placeId.trim();
    const label = record.label.trim();
    return placeId && label ? [{ placeId, label }] : [];
  }).slice(0, 6);
}

export async function autocompleteAddress(input: string, sessionToken: string): Promise<AddressPrediction[]> {
  const response = await httpsCallable(functions(), "autocompleteAddress")({ input, sessionToken });
  return predictionsFrom(response.data);
}

export async function resolveAddress(placeId: string, input: string, sessionToken: string): Promise<string> {
  const response = await httpsCallable(functions(), "resolveAddress")({ placeId, input, sessionToken });
  const address = asRecord(response.data)?.address;
  if (typeof address !== "string" || !address.trim()) {
    throw new Error("Address resolution returned no address");
  }
  return address.trim();
}
