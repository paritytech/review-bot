import Joi from "joi";

import { ConfigurationFile, Rule } from "./types";

const ruleSchema = Joi.object<Rule>().keys({
  name: Joi.string().required(),
  condition: Joi.object<Rule["condition"]>().keys({
    include: Joi.array().items(Joi.string()).required(),
    exclude: Joi.array().items(Joi.string()).optional().allow(null),
  }),
});

export const schema = Joi.object<ConfigurationFile>().keys({
  rules: Joi.array<ConfigurationFile["rules"]>().items(ruleSchema).required(),
  preventReviewRequests: Joi.object<ConfigurationFile["preventReviewRequests"]>()
    .keys({
      users: Joi.array().items(Joi.string()).optional().allow(null),
      teams: Joi.array().items(Joi.string()).optional().allow(null),
    })
    .optional()
    .allow(null),
});
