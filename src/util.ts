import { debug, error, info, warning } from "@actions/core";

import { ActionLogger } from "./github/types";

export function generateCoreLogger(): ActionLogger {
  return { info, debug, warn: warning, error };
}

/** Concats two arrays and remove the duplicates */
export function concatArraysUniquely<T>(arr1?: T[], arr2?: T[]): T[] {
  // We concat the two arrays
  const concatedArray = (arr1 ?? []).concat(arr2 ?? []);
  // We remove the duplicated values and return the array
  return concatedArray.filter((item, pos) => concatedArray.indexOf(item) === pos);
}

/** Case insentive comparison of two strings
 * @example caseInsensitiveEqual("hi", "HI") === true
 */
export function caseInsensitiveEqual<T extends string>(a: T, b: T): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

/**
 * Converts a username to it's handle (adds the '@' at the beggining)
 * @param handle The username
 */
export const toHandle = (handle: string): string => `@${handle}`;
