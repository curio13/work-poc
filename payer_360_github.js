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
      primaryKey: true,
      title: `Benefit Type`,
      description: `This field tells the benefit type by Manish`,
      meta: {
        owner: `Annant`,
        use_cases: `Tells the benefit`,
        kpi: true,
      }
    },

    gpo_name: {
      sql: `gpo_name`,
      type: `string`,
      title: `Name of Gpo`,
      description: `This field tells the  gpo name by Manish`,
      meta: {
        calculation_logic: `COALESCE(rx_lives, mx_lives) - Uses RX lives if available, otherwise falls back to MX lives`,
      }
    }
  },

  measures: {
    count: {
      type: `count`,
      title: `Total Count`,
      description: `This field tells the count of the rows`,
      format: `number`,
      meta: {
        owner: `Manish`,
        domain: `Gpo_claims`,
      }
    }
  }
});
