export interface Rule {
  name: string;
  condition: { include: string[]; exclude?: string[] };
}

export interface ConfigurationFile {
  rules: Rule[];
  preventReviewRequests: {
    teams?: string[];
    users: string[];
  };
}
