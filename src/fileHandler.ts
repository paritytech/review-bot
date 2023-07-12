interface Rule {
  name: string;
  condition: { include: string[]; exclude: string[] };
}

export interface ConfigurationFile {
  rules: Rule[];
  "prevent-review-request": {
    teams?: string[];
    users: string[];
  };
}
