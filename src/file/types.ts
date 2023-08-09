export enum RuleTypes {
  Basic = "basic",
  Debug = "debug",
  And = "and",
}

export type Reviewers = { users?: string[]; teams?: string[] };

export interface Rule {
  name: string;
  condition: { include: string[]; exclude?: string[] };
}

// TODO: Delete this once we add a second type of rule
export interface DebugRule extends Rule {
  type: RuleTypes.Debug;
  size: number;
}

export interface BasicRule extends Rule, Reviewers {
  type: RuleTypes.Basic;
  min_approvals: number;
}

export interface AndRule extends Rule {
  reviewers: {
    min_approvals: number;
  } & Reviewers[];
}

export interface ConfigurationFile {
  /** Based on the `type` parameter, Typescript converts the object to the correct type
   * @see {@link Rules}
   */
  rules: (BasicRule | DebugRule | AndRule)[];
  preventReviewRequests?: {
    teams?: string[];
    users?: string[];
  };
}
