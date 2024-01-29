import { debug, error, info, warning } from "@actions/core";

import { ActionLogger } from "./github/types";
import { FellowsScore } from "./rules/types";

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

/** Converts a rank into its value inside the score configuration */
export function rankToScore(rank: number, scores: FellowsScore): number {
  switch (rank) {
    case 1:
      return scores.dan1;
    case 2:
      return scores.dan2;
    case 3:
      return scores.dan3;
    case 4:
      return scores.dan4;
    case 5:
      return scores.dan5;
    case 6:
      return scores.dan6;
    case 7:
      return scores.dan7;
    case 8:
      return scores.dan8;
    case 9:
      return scores.dan9;
    default:
      throw new Error(`Rank ${rank} is out of bounds. Ranks are between I and IX`);
  }
}
