/**
 * OpenAI function-calling schemas for BetterNotes.
 * 仅声明，无业务依赖。
 */
export const FUNCTION_SCHEMAS: any[] = [
  {
    type: 'function',
    function: {
      name: 'getCurFile',
      description: 'Return path and full text of the file currently in focus in the editor.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getCurFileNotes',
      description: 'Return all BetterNotes entries that belong to the current file.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getAllNotes',
      description: 'Return every BetterNotes entry in the vault (may be large).',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'notesSearch',
      description: 'Search all BetterNotes entries using semantic-vector similarity and return the most relevant snippets. Use this when the user asks questions that rely on the BetterNotes entry database rather than raw vault files.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language query used to retrieve relevant entry snippets.'
          },
          top_k: {
            type: 'integer',
            description: 'Number of snippets to return (default 8, max 20)'
          },
          min_similarity: {
            type: 'number',
            description: 'Similarity threshold between 0 and 1 (default configured in plugin).'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchVault',
      description: 'Search the whole vault using semantic-vector similarity and return the most relevant note snippets. Use this when the user asks questions that may require retrieving existing knowledge from their notes.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query used to retrieve relevant note chunks.'
          },
          scope: {
            type: 'object',
            description: 'You are not allowed to use this parameter.',
            properties: {
              files: {
                type: 'array',
                items: { type: 'string' },
                description: 'You are not allowed to use this parameter.'
              },
              folders: {
                type: 'array',
                items: { type: 'string' },
                description: 'You are not allowed to use this parameter.'
              }
            }
          },
          top_k: {
            type: 'integer',
            description: '7 at start, when failed, you can retry with 15'
          },
          min_similarity: {
            type: 'number',
            description: '0.20 at start, when failed, you can retry with 0.10'
          }
        },
        required: ['query']
      }
    }
  }
];
