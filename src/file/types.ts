enum Rules {
  Basic = "basic",
  Debug = "debug",
}

export interface Rule {
  name: string;
  condition: { include: string[]; exclude?: string[] };
}

// TODO: Delete this once we add a second type of rule
export interface DebugRule extends Rule {
  type: Rules.Debug;
  size: number;
}

export interface BasicRule extends Rule {
  type: Rules.Basic;
  min_approvals: number;
  users?: string[];
  teams?: string[];
}

export interface ConfigurationFile {
  /** Based on the `type` parameter, Typescript converts the object to the correct type
   * @see {@link Rules}
   */
  rules: (BasicRule | DebugRule)[];
  preventReviewRequests: {
    teams?: string[];
    users: string[];
  };
}
