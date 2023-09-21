export enum RuleTypes {
  Basic = "basic",
  And = "and",
  Or = "or",
  AndDistinct = "and-distinct",
  Fellows = "fellows",
}

export type Reviewers = { users?: string[]; teams?: string[]; min_approvals: number };

export interface Rule {
  name: string;
  condition: { include: string[]; exclude?: string[] };
  allowedToSkipRule?: Omit<Reviewers, "min_approvals">;
  countAuthor?: boolean;
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

export interface FellowsRule extends Rule {
  type: RuleTypes.Fellows;
  minRank: number;
  min_approvals: number;
}

export interface ConfigurationFile {
  /** Based on the `type` parameter, Typescript converts the object to the correct type
   * @see {@link Rules}
   */
  rules: (BasicRule | AndRule | OrRule | AndDistinctRule | FellowsRule)[];
  preventReviewRequests?: {
    teams?: string[];
    users?: string[];
  };
}
