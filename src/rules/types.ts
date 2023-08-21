export enum RuleTypes {
  Basic = "basic",
  Debug = "debug",
  And = "and",
  Or = "or",
  AndDistinct = "and-distinct",
}

export type Reviewers = { users?: string[]; teams?: string[]; min_approvals: number };

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
}

export interface AndRule extends Rule {
  type: RuleTypes.And;
  reviewers: Reviewers[];
}

export interface OrRule extends Rule {
  type: RuleTypes.Or;
  reviewers: Reviewers[];
}

export interface AndDistinctRule extends Rule {
  type: RuleTypes.AndDistinct;
  reviewers: Reviewers[];
}

export interface ConfigurationFile {
  /** Based on the `type` parameter, Typescript converts the object to the correct type
   * @see {@link Rules}
   */
  rules: (BasicRule | DebugRule | AndRule | OrRule | AndDistinctRule)[];
  preventReviewRequests?: {
    teams?: string[];
    users?: string[];
  };
}
