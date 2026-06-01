const ruleSourceValues = ['clearurls', 'adguard', 'brave', 'firefox', 'custom'] as const;
const ruleKindValues = ['strip-param', 'raw-replace', 'unwrap-redirect', 'block-domain'] as const;

const catalogSourceSchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { enum: ruleSourceValues },
    version: { type: 'string' },
    hash: { type: 'string' },
    license: { type: 'string' },
    upstream: { type: 'string' }
  }
} as const;

const ruleBaseProperties = {
  source: { enum: ruleSourceValues },
  provider: { type: 'string' },
  urlPattern: { type: 'string' },
  exceptions: {
    type: 'array',
    items: { type: 'string' }
  }
} as const;

const matchedRuleSchema = {
  type: 'object',
  required: ['source', 'provider', 'kind'],
  additionalProperties: false,
  properties: {
    source: { enum: ruleSourceValues },
    provider: { type: 'string' },
    kind: { enum: ruleKindValues },
    detail: { type: 'string' }
  }
} as const;

export const sanitizerOptionsJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://url-sanitize.dev/schema/v1/options.json',
  title: 'url-sanitize options',
  type: 'object',
  additionalProperties: false,
  properties: {
    stripReferralMarketing: { type: 'boolean' },
    unwrapRedirects: { type: 'boolean' },
    domainBlocking: { type: 'boolean' }
  }
} as const;

export const sanitizerCatalogJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://url-sanitize.dev/schema/v1/catalog.json',
  title: 'url-sanitize catalog',
  type: 'object',
  required: ['version', 'generatedAt', 'sources', 'rules'],
  additionalProperties: false,
  properties: {
    version: { type: 'string' },
    generatedAt: { type: 'string' },
    sources: {
      type: 'array',
      items: catalogSourceSchema
    },
    rules: {
      type: 'array',
      items: {
        oneOf: [
          {
            type: 'object',
            required: ['kind', 'source', 'provider', 'paramPattern'],
            additionalProperties: false,
            properties: {
              ...ruleBaseProperties,
              kind: { const: 'strip-param' },
              paramPattern: { type: 'string' },
              isReferralMarketing: { type: 'boolean' }
            }
          },
          {
            type: 'object',
            required: ['kind', 'source', 'provider', 'pattern', 'replacement'],
            additionalProperties: false,
            properties: {
              ...ruleBaseProperties,
              kind: { const: 'raw-replace' },
              pattern: { type: 'string' },
              replacement: { type: 'string' }
            }
          },
          {
            type: 'object',
            required: ['kind', 'source', 'provider', 'pattern', 'captureGroup'],
            additionalProperties: false,
            properties: {
              ...ruleBaseProperties,
              kind: { const: 'unwrap-redirect' },
              pattern: { type: 'string' },
              captureGroup: { type: 'integer', minimum: 0 }
            }
          },
          {
            type: 'object',
            required: ['kind', 'source', 'provider', 'urlPattern'],
            additionalProperties: false,
            properties: {
              ...ruleBaseProperties,
              kind: { const: 'block-domain' }
            }
          }
        ]
      }
    }
  }
} as const;

export const sanitizeResultJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://url-sanitize.dev/schema/v1/result.json',
  title: 'url-sanitize result',
  oneOf: [
    {
      type: 'object',
      required: ['kind', 'url'],
      additionalProperties: false,
      properties: {
        kind: { const: 'unchanged' },
        url: { type: 'string' }
      }
    },
    {
      type: 'object',
      required: ['kind', 'original', 'url', 'strippedParams', 'matchedRules'],
      additionalProperties: false,
      properties: {
        kind: { const: 'cleaned' },
        original: { type: 'string' },
        url: { type: 'string' },
        strippedParams: {
          type: 'array',
          items: { type: 'string' }
        },
        matchedRules: {
          type: 'array',
          items: matchedRuleSchema
        }
      }
    },
    {
      type: 'object',
      required: ['kind', 'original', 'url', 'via'],
      additionalProperties: false,
      properties: {
        kind: { const: 'redirected' },
        original: { type: 'string' },
        url: { type: 'string' },
        via: matchedRuleSchema
      }
    },
    {
      type: 'object',
      required: ['kind', 'original', 'via'],
      additionalProperties: false,
      properties: {
        kind: { const: 'blocked' },
        original: { type: 'string' },
        via: matchedRuleSchema
      }
    }
  ]
} as const;

export const urlSanitizeJsonSchemas = {
  catalog: sanitizerCatalogJsonSchema,
  options: sanitizerOptionsJsonSchema,
  result: sanitizeResultJsonSchema
} as const;
