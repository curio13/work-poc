cube(`payer_360_github`, {
  sql_table: `"oasis-dev-cube-poc".payer_360_gpo_benefit_type_config`,

  data_source: `default`,
  public: false,

  refreshKey: {
    every: `5 minute`
  },

  dimensions: {
    benefit_type: {
      sql: `benefit_type`,
      type: `string`,
      primaryKey: true
    },

    gpo_name: {
      sql: `gpo_name`,
      type: `string`
    }
  },

  measures: {
    count: {
      type: `count`
      
    }
  }
});
