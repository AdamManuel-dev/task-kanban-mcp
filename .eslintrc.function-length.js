module.exports = {
  "rules": {
    "max-lines-per-function": [
      "error",
      {
        "max": 40,
        "skipComments": true,
        "skipBlankLines": true
      }
    ]
  },
  "overrides": [
    {
      "files": [
        "src/routes/tasks.ts"
      ],
      "rules": {
        "max-lines-per-function": [
          "warn",
          {
            "max": 1057,
            "skipComments": true,
            "skipBlankLines": true
          }
        ]
      }
    },
    {
      "files": [
        "src/services/BackupService.ts"
      ],
      "rules": {
        "max-lines-per-function": [
          "warn",
          {
            "max": 963,
            "skipComments": true,
            "skipBlankLines": true
          }
        ]
      }
    },
    {
      "files": [
        "src/services/TaskService.ts"
      ],
      "rules": {
        "max-lines-per-function": [
          "warn",
          {
            "max": 935,
            "skipComments": true,
            "skipBlankLines": true
          }
        ]
      }
    },
    {
      "files": [
        "src/routes/boards.ts"
      ],
      "rules": {
        "max-lines-per-function": [
          "warn",
          {
            "max": 738,
            "skipComments": true,
            "skipBlankLines": true
          }
        ]
      }
    },
    {
      "files": [
        "src/cli/api-client-wrapper.ts"
      ],
      "rules": {
        "max-lines-per-function": [
          "warn",
          {
            "max": 688,
            "skipComments": true,
            "skipBlankLines": true
          }
        ]
      }
    }
  ]
};