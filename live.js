cube(`payer_360_lives`, {
  // ========== CUBE-LEVEL METADATA ==========
  title: `Payer 360 Lives`,
  description: `Comprehensive view of payer lives across commercial, Medicare, and Medicaid book of business. Includes ecosystem and national level aggregations with MDM hierarchy integration. This cube provides insights into market coverage, penetration analysis, and payer organizational structures.`,
  
  meta: {
    owner: `Payer Analytics Team`,
    domain: `Healthcare`,
    data_classification: `Confidential`,
    update_frequency: `Monthly`,
    source_system: `MDM + DRG Plan + PBM Monthly Feeds`,
    last_reviewed: `2026-03-01`,
    use_cases: [
      `Market share analysis`,
      `Ecosystem penetration tracking`,
      `Payer coverage reporting`,
      `Commercial lives benchmarking`
    ]
  },

  sql: `
    SELECT *
    FROM "oasis-dev-cube-poc"."payer_360_lives"
    WHERE
    ${FILTER_GROUP(FILTER_PARAMS.payer_360_lives.flagCurrentRecord.filter('flag_current_record'), FILTER_PARAMS.payer_360_lives.gneBookOfBusiness.filter('gne_book_of_business'), FILTER_PARAMS.payer_360_lives.livesSource.filter('lives_source'))}
  `,

  refresh_key: {
    every: `5 minute`
  },

  // ========== JOINS ==========
  joins: {
    payer_360_mco_hierarchy: {
      relationship: `many_to_one`,
      sql: `
        ${CUBE.mdm_plan_id} = ${payer_360_mco_hierarchy.base_mdm_id}
      AND ${CUBE.mdm_payer_id} = ${payer_360_mco_hierarchy.base_mdm_id}
      `
    }
  },

  // ========== MEASURES ==========
  measures: {
    commercialLives: {
      sql: `COALESCE(rx_lives, mx_lives)`,
      type: `sum`,
      title: `Total Commercial Lives`,
      description: `Total count of commercial lives, prioritizing pharmacy benefit lives (RX) over medical benefit lives (MX) when both are available. This is the primary measure for calculating market coverage.`,
      meta: {
        kpi: true,
        calculation_logic: `COALESCE(rx_lives, mx_lives) - Uses RX lives if available, otherwise falls back to MX lives`,
        data_quality_threshold: `>= 95%`,
        typical_range: `1000 - 50000000`,
        aggregation_type: `Additive`,
        business_use_case: `Primary metric for market share calculations and coverage analysis`
      }
    },

    count: {
      type: `count`,
      title: `Record Count`,
      description: `Total count of records in the payer lives dataset. Useful for data quality checks and understanding data granularity.`,
      meta: {
        use_case: `Data validation and audit purposes`
      }
    },
        mx_lives: {
      sql: `mx_lives`,
      type: `sum`,
      title: `Medical Lives`,
      description: `Medical Benefit Lives count. Raw medical coverage lives before coalescing with RX lives.`,
      meta: {
        data_source: `Medical benefits data feeds`,
        use_case: `Medical benefit-specific analysis`,
        related_measures: [`commercialLives`]
      }
    },
    
    rx_lives: {
      sql: `rx_lives`,
      type: `sum`,
      title: `Pharmacy Lives`,
      description: `Pharmacy Benefit Lives count. Raw pharmacy coverage lives, prioritized in commercialLives calculation.`,
      meta: {
        data_source: `Pharmacy benefits data feeds`,
        use_case: `Pharmacy benefit-specific analysis`,
        related_measures: [`commercialLives`]
      }
    },

    pbm_rx_lives: {
      sql: `pbm_rx_lives`,
      type: `sum`,
      title: `PBM RX Lives`,
      description: `Total pharmacy benefit lives managed by Pharmacy Benefit Managers (PBM). Used for PBM-specific analysis and reporting.`,
      meta: {
        calculation_logic: `Direct sum of pbm_rx_lives column`,
        data_source: `PBM Monthly Feeds`,
        business_use_case: `PBM coverage analysis and relationship management`
      }
    },

    // ── Multi-stage denominator: total lives for the same ecosystem_code + benefit_type
    // Uses group_by so the inner stage aggregates only over those two dimensions,
    // regardless of what other dimensions (payer, plan, etc.) are in the outer query.
    ecosystemTotalLives: {
      sql: `${commercialLives}`,
      type: `sum`,
      multi_stage: true,
      group_by: [CUBE.ecosystem_code, CUBE.benefit_type, CUBE.date_year_month],
      public: false,
      title: `Ecosystem Total Lives (Denominator)`,
      description: `Total commercial lives aggregated at the ecosystem_code + benefit_type level. Used as the denominator for % of Ecosystem Lives. Respects all user-applied filters dynamically.`,
      shown: false,
      meta: {
        internal: true,
        calculation_logic: `SUM(commercialLives) grouped by ecosystem_code + benefit_type via multi_stage`
      }
    },

    // ── Multi-stage denominator: total lives for the same benefit_type across all ecosystems
    nationalTotalLives: {
      sql: `${commercialLives}`,
      type: `sum`,
      multi_stage: true,
      group_by: [CUBE.benefit_type, CUBE.date_year_month],
      public: false,
      title: `National Total Lives (Denominator)`,
      description: `Total commercial lives aggregated at the benefit_type level across all ecosystems. Used as the denominator for % of National Lives. Respects all user-applied filters dynamically.`,
      shown: false,
      meta: {
        internal: true,
        calculation_logic: `SUM(commercialLives) grouped by benefit_type only via multi_stage`
      }
    },
    ecosystemTotalBoBLives: {
      sql: `${commercialLives}`,
      type: `sum`,
      multi_stage: true,
      group_by: [CUBE.ecosystem_code, CUBE.benefit_type, CUBE.gne_book_of_business, CUBE.date_year_month],
      public: false,
      title: `Ecosystem Total Lives (Denominator)`,
      description: `Total commercial lives aggregated at the ecosystem_code + benefit_type level. Used as the denominator for % of Ecosystem Lives. Respects all user-applied filters dynamically.`,
      shown: false,
      meta: {
        internal: true,
        calculation_logic: `SUM(commercialLives) grouped by ecosystem_code + benefit_type via multi_stage`
      }
    },
    nationalTotalBoBLives: {
      sql: `${commercialLives}`,
      type: `sum`,
      multi_stage: true,
      group_by: [CUBE.benefit_type, CUBE.gne_book_of_business, CUBE.date_year_month],
      public: false,
      title: `National Total Lives (Denominator)`,
      description: `Total commercial lives aggregated at the benefit_type level across all ecosystems. Used as the denominator for % of National Lives. Respects all user-applied filters dynamically.`,
      shown: false,
      meta: {
        internal: true,
        calculation_logic: `SUM(commercialLives) grouped by benefit_type only via multi_stage`
      }
    },

    percentOfEcosystemLives: {
      sql: `CAST(${commercialLives} AS DECIMAL(38,20)) / CAST(NULLIF(${ecosystemTotalLives}, 0) AS DECIMAL(38,20))`,
      type: `number`,
      multi_stage: true,
      format: `percent`,
      title: `% of Ecosystem Lives`,
      description: `Percentage of lives within a specific ecosystem relative to total ecosystem lives. Denominator is computed dynamically via multi_stage, fully respecting user-applied filters.`,
      meta: {
        kpi: true,
        benchmark_target: `20%`,
        calculation_logic: `commercialLives / ecosystemTotalLives (grouped by ecosystem_code + benefit_type)`,
        business_use_case: `Ecosystem market penetration analysis and regional targeting`,
        reporting_frequency: `Monthly`,
        target_audience: `Regional Sales Teams, Market Access`
      }
    },

    percentOfNationalLives: {
      sql: `CAST(${commercialLives} AS DECIMAL(38,20)) / CAST(NULLIF(${nationalTotalLives}, 0) AS DECIMAL(38,20))`,
      type: `number`,
      multi_stage: true,
      format: `percent`,
      title: `% of National Lives`,
      description: `Percentage of lives relative to total national commercial lives. Denominator is computed dynamically via multi_stage, fully respecting user-applied filters.`,
      meta: {
        kpi: true,
        benchmark_target: `10%`,
        calculation_logic: `commercialLives / nationalTotalLives (grouped by benefit_type only)`,
        business_use_case: `National market share analysis and strategic planning`,
        reporting_frequency: `Quarterly`,
        target_audience: `Executive Leadership, National Sales`
      }
    },

    percentOfEcosystemBoBLives: {
      sql: `CAST(${commercialLives} AS DECIMAL(38,20)) / CAST(NULLIF(${ecosystemTotalBoBLives}, 0) AS DECIMAL(38,20))`,
      type: `number`,
      multi_stage: true,
      format: `percent`,
      title: `% of BoB Ecosystem Lives`,
      description: `Percentage of lives within a specific ecosystem relative to total ecosystem lives. Denominator is computed dynamically via multi_stage, fully respecting user-applied filters.`,
      meta: {
        kpi: true,
        benchmark_target: `20%`,
        calculation_logic: `commercialLives / ecosystemTotalLives (grouped by ecosystem_code + benefit_type)`,
        business_use_case: `Ecosystem market penetration analysis and regional targeting`,
        reporting_frequency: `Monthly`,
        target_audience: `Regional Sales Teams, Market Access`
      }
    },

    percentOfNationalBoBLives: {
      sql: `CAST(${commercialLives} AS DECIMAL(38,20)) / CAST(NULLIF(${nationalTotalBoBLives}, 0) AS DECIMAL(38,20))`,
      type: `number`,
      multi_stage: true,
      format: `percent`,
      title: `% of BoB National Lives`,
      description: `Percentage of lives relative to total national commercial lives. Denominator is computed dynamically via multi_stage, fully respecting user-applied filters.`,
      meta: {
        kpi: true,
        benchmark_target: `10%`,
        calculation_logic: `commercialLives / nationalTotalLives (grouped by benefit_type only)`,
        business_use_case: `National market share analysis and strategic planning`,
        reporting_frequency: `Quarterly`,
        target_audience: `Executive Leadership, National Sales`
      }
    }
  },

  // ========== PRE-AGGREGATIONS ==========
  // Note: multi_stage measures (percentOfEcosystemLives, percentOfNationalLives,
  // ecosystemTotalLives, nationalTotalLives) cannot be accelerated by pre-aggregations.
  // Only additive measures like commercialLives are included here.
  pre_aggregations: {
    commercial_lives_rollup: {
      measures: [
        CUBE.commercialLives,
        CUBE.pbm_rx_lives
      ],
      dimensions: [
        // High selectivity filters first
        CUBE.gne_book_of_business,
        CUBE.flag_current_record,
        CUBE.lives_source,
        CUBE.benefit_type,
        CUBE.ecosystem_code,
        CUBE.ecosystem_name,
        CUBE.geography_type,
        CUBE.mdm_payer_category,
        CUBE.mdm_payer_id,
        CUBE.mdm_payer_name,
        CUBE.mdm_payer_role,
        CUBE.mdm_pbm_id,
        CUBE.mdm_pbm_name
      ],
      refresh_key: {
        every: `1 day`
      }
    }
  },

  // ========== DIMENSIONS ==========
  dimensions: {
    benefit_type: {
      sql: `benefit_type`,
      type: `string`,
      primaryKey: true,
      title: `Benefit Type`,
      description: `Type of healthcare benefit - either Pharmacy Benefit (RX) or Medical Benefit (MX). Critical dimension for separating pharmacy vs medical coverage analysis.`,
      meta: {
        valid_values: [`Pharmacy Benefit`, `Medical Benefit`],
        cardinality: `low`,
        filter_recommended: true,
        data_quality_rule: `Must be one of the valid values`
      }
    },
    
    ecosystem_code: {
      sql: `ecosystem_code`,
      type: `string`,
      primaryKey: true,
      title: `Ecosystem Code`,
      description: `Unique identifier for geographic ecosystems, pulled against postal code for lives and against zip_ecosystem_name for pbm_payer_lives_monthly. Used for regional market analysis.`,
      meta: {
        cardinality: `medium`,
        data_lineage: `Derived from postal code mapping to ecosystem regions`,
        sample_values: [`ECO001`, `ECO002`, `ECO123`],
        related_dimensions: [`ecosystem_name`, `geography_type`]
      }
    },
    
    ecosystem_name: {
      sql: `ecosystem_name`,
      type: `string`,
      title: `Ecosystem Name`,
      description: `User-friendly name of the ecosystem region, pulled against postal code. Provides readable labels for geographic market segments.`,
      meta: {
        cardinality: `medium`,
        data_lineage: `Mapped from ecosystem_code via postal code lookup`,
        sample_values: [`Northeast Metro`, `Southern Region`, `West Coast`],
        display_priority: `high`
      }
    },
    
    mdm_payer_id: {
      sql: `mdm_payer_id`,
      type: `string`,
      primaryKey: true,
      title: `Payer ID`,
      description: `Master Data Management (MDM) unique identifier for payers. Pulled from MDM Hierarchy. Primary business key for payer entity identification.`,
      meta: {
        business_key: true,
        pii: false,
        cardinality: `high`,
        sample_values: [`P12345`, `P67890`],
        data_lineage: `MDM Hierarchy System`,
        related_dimensions: [`mdm_payer_name`, `mdm_payer_parent_id`]
      }
    },
    
    mdm_payer_name: {
      sql: `mdm_payer_name`,
      type: `string`,
      title: `Payer Name`,
      description: `Official name of the payer organization from MDM Hierarchy. Primary display field for payer identification in reports.`,
      meta: {
        cardinality: `high`,
        display_priority: `high`,
        data_quality_rule: `Must not be null for active payers`,
        sample_values: [`United Healthcare`, `Aetna`, `Blue Cross Blue Shield`]
      }
    },
    
    mdm_pbm_id: {
      sql: `mdm_pbm_id`,
      type: `string`,
      primaryKey: true,
      title: `PBM ID`,
      description: `Master Data Management unique identifier for Pharmacy Benefit Managers. Pulled from MDM Hierarchy.`,
      meta: {
        business_key: true,
        pii: false,
        cardinality: `medium`,
        sample_values: [`PBM001`, `PBM002`],
        data_lineage: `MDM Hierarchy System`,
        related_dimensions: [`mdm_pbm_name`, `mdm_pbm_parent_id`]
      }
    },
    
    mdm_pbm_name: {
      sql: `mdm_pbm_name`,
      type: `string`,
      title: `PBM Name`,
      description: `Official name of the Pharmacy Benefit Manager from MDM Hierarchy. Used for PBM relationship analysis and reporting.`,
      meta: {
        cardinality: `medium`,
        display_priority: `high`,
        sample_values: [`CVS Caremark`, `Express Scripts`, `OptumRx`]
      }
    },
    
    flag_current_record: {
      sql: `flag_current_record`,
      type: `string`,
      title: `Current Record Flag`,
      description: `Latest record indicator for the lowest grain, with values "Y" (current) or "N" (historical). Use "Y" to get the most recent snapshot of lives data.`,
      meta: {
        valid_values: [`Y`, `N`],
        default_filter_value: `Y`,
        business_note: `Always filter by Y for current state analysis`,
        cardinality: `low`,
        filter_recommended: true,
        scd_type: `Type 2 Slowly Changing Dimension flag`
      }
    },
    
    gne_book_of_business: {
      sql: `gne_book_of_business`,
      type: `string`,
      title: `GNE Book of Business`,
      description: `GNE Enhanced Book of Business classification (Medicare_Advantage, Commercial, Medicaid_FFS, Medicare, Medicaid_Managed, Government). Based on configurable business rules for Medicare and Medicaid categorization.`,
      meta: {
        valid_values: [`Commercial`, `Medicare`, `Medicare_Advantage`, `Medicaid_FFS`, `Medicaid_Managed`, `Government`],
        default_filter_value: `Commercial`,
        cardinality: `low`,
        filter_recommended: true,
        data_quality_rule: `Must match valid values list`
      }
    },
    
    geography_type: {
      sql: `
    CASE
      WHEN ${CUBE.ecosystem_code} IS NULL THEN 'NATIONAL'
      ELSE 'ECOSYSTEM'
    END
  `,
      type: `string`,
      title: `Geography Type`,
      description: `Indicates whether the data represents NATIONAL or ECOSYSTEM level aggregation. Derived from presence/absence of ecosystem_code.`,
      meta: {
        valid_values: [`NATIONAL`, `ECOSYSTEM`],
        calculation_logic: `If ecosystem_code IS NULL then NATIONAL, else ECOSYSTEM`,
        cardinality: `low`,
        use_case: `Filter to separate national vs regional analysis`
      }
    },
    
    zip: {
      sql: `zip`,
      type: `string`,
      primaryKey: true,
      title: `ZIP Code`,
      description: `Postal Code for geographic location. Provides granular geographic detail for coverage analysis.`,
      meta: {
        pii: false,
        cardinality: `very_high`,
        data_quality_rule: `Should be 5-digit US ZIP code format`,
        sample_values: [`94102`, `10001`, `60601`]
      }
    },
    
    date_id: {
      sql: `date_id`,
      type: `string`,
      primaryKey: true,
      title: `Date ID`,
      description: `Date identifier created based on the date month using the first day of month (YYYYMMDD format). Primary key for time-based partitioning.`,
      meta: {
        format: `YYYYMMDD`,
        sample_values: [`20260101`, `20260201`],
        data_quality_rule: `Must be first day of month`,
        related_dimensions: [`date_year_month`, `date_year_quarter`, `date_year`]
      }
    },
    
    date_year_month: {
      sql: `date_year_month`,
      type: `string`,
      title: `Year-Month`,
      description: `Year and Month for the lives record (YYYY-MM format). Primary time dimension for monthly trending and analysis.`,
      meta: {
        format: `YYYY-MM`,
        sample_values: [`2026-01`, `2026-02`],
        display_priority: `high`,
        use_case: `Monthly trend analysis`
      }
    },
    
    date_year_quarter: {
      sql: `date_year_quarter`,
      type: `string`,
      title: `Year-Quarter`,
      description: `Year and Quarter for the lives record (YYYY-QN format). Used for quarterly business reporting cycles.`,
      meta: {
        format: `YYYY-QN`,
        sample_values: [`2026-Q1`, `2026-Q2`],
        use_case: `Quarterly business reviews and reporting`
      }
    },
    
    date_year: {
      sql: `date_year`,
      type: `string`,
      title: `Year`,
      description: `Calendar year for the lives record (YYYY format). Used for year-over-year comparisons and annual reporting.`,
      meta: {
        format: `YYYY`,
        sample_values: [`2024`, `2025`, `2026`],
        use_case: `Annual reporting and YoY analysis`
      }
    },
    
    commercial_region_name: {
      sql: `commercial_region_name`,
      type: `string`,
      title: `Commercial Region Name`,
      description: `Commercial sales region name. Used for aligning lives data with commercial sales territories and regional business planning.`,
      meta: {
        cardinality: `low`,
        sample_values: [`Northeast`, `Southeast`, `Midwest`, `West`],
        use_case: `Sales territory alignment and regional performance tracking`
      }
    },
    
    mdm_book_of_business: {
      sql: `mdm_book_of_business`,
      type: `string`,
      primaryKey: true,
      title: `MDM Book of Business`,
      description: `MDM Book of Business classification (Commercial, Government, Medicaid, Medicare, Managed_Care, etc.). Available for "Plan" entity types only. Source system classification.`,
      meta: {
        valid_values: [`Commercial`, `Government`, `Medicaid`, `Medicare`, `Managed_Care`],
        cardinality: `low`,
        entity_type_restriction: `Plan entities only`,
        data_lineage: `MDM System`,
        related_dimensions: [`gne_book_of_business`]
      }
    },
    
    mdm_payer_role: {
      sql: `mdm_payer_role`,
      type: `string`,
      title: `Payer Role`,
      description: `MDM Payer Role classification (EMPLOYER, GOVERNMENT, HEALTH INSURER, etc.). Defines the functional role of the payer in the healthcare ecosystem.`,
      meta: {
        valid_values: [`EMPLOYER`, `GOVERNMENT`, `HEALTH INSURER`, `TPA`, `PLAN ADMINISTRATOR`],
        cardinality: `low`,
        use_case: `Payer segmentation and targeting strategies`
      }
    },
    
    lives_source: {
      sql: `lives_source`,
      type: `string`,
      primaryKey: true,
      title: `Lives Data Source`,
      description: `Source system for lives data with values 'DRG Plan' and 'Payer-PBM'. Indicates data lineage and source system for lives counts.`,
      meta: {
        valid_values: [`DRG Plan`, `Payer-PBM`],
        default_filter_value: `DRG Plan`,
        data_lineage: `DRG Plan database or PBM monthly feeds`,
        cardinality: `low`,
        filter_recommended: true,
        data_quality_note: `Different sources may have different coverage and update frequencies`
      }
    },
    
    mdm_plan_id: {
      sql: `mdm_plan_id`,
      type: `string`,
      primaryKey: true,
      title: `Plan ID`,
      description: `MDM Plan unique identifier. Granular level identifier for specific health plans within payer organizations.`,
      meta: {
        business_key: true,
        pii: false,
        cardinality: `very_high`,
        sample_values: [`PLN12345`, `PLN67890`],
        data_lineage: `MDM Hierarchy System`,
        related_dimensions: [`mdm_plan_name`, `mdm_plan_type`]
      }
    },
    
    mdm_plan_name: {
      sql: `mdm_plan_name`,
      type: `string`,
      title: `Plan Name`,
      description: `Official plan name from MDM Hierarchy. Detailed plan-level naming for granular analysis and reporting.`,
      meta: {
        cardinality: `very_high`,
        display_priority: `high`,
        data_quality_rule: `Must not be null for active plans`
      }
    },
    
    mdm_plan_type: {
      sql: `mdm_plan_type`,
      type: `string`,
      primaryKey: true,
      title: `Plan Type`,
      description: `MDM Plan Type classification from source system (HMO, PPO, EPO, POS, etc.). Defines the structure and network characteristics of the health plan.`,
      meta: {
        valid_values: [`HMO`, `PPO`, `EPO`, `POS`, `HDHP`, `Indemnity`],
        cardinality: `low`,
        use_case: `Plan design analysis and network strategy`
      }
    },
    
    mdm_payer_category: {
      sql: `mdm_payer_category`,
      type: `string`,
      title: `Payer Category`,
      description: `Payer categorization from MDM Hierarchy. High-level classification for payer segmentation and strategic analysis.`,
      meta: {
        cardinality: `low`,
        use_case: `Strategic payer segmentation and prioritization`,
        sample_values: [`National`, `Regional`, `Blues`, `Medicaid MCO`]
      }
    },
    
    gne_mco_name: {
      sql: `gne_mco_name`,
      type: `string`,
      title: `GNE MCO Name`,
      description: `GNE Managed Care Organization name for Payer/MAC/Employer categories. Concatenation of mdm_payer_name + role designation (EMPLOYER/MAC).`,
      meta: {
        calculation_logic: `mdm_payer_name + ' (' + category + ')'`,
        cardinality: `high`,
        use_case: `MCO relationship management and reporting`,
        data_quality_note: `Composite field - verify components for accuracy`
      }
    },
    
    mdm_payer_parent_id: {
      sql: `mdm_payer_parent_id`,
      type: `string`,
      title: `Payer Parent ID`,
      description: `MDM identifier for the parent payer organization. Used for hierarchical rollup to ultimate parent level.`,
      meta: {
        business_key: true,
        cardinality: `medium`,
        data_lineage: `MDM Hierarchy System`,
        use_case: `Parent-level aggregation and group analysis`,
        related_dimensions: [`mdm_payer_parent_name`, `mdm_payer_id`]
      }
    },
    
    mdm_payer_parent_name: {
      sql: `mdm_payer_parent_name`,
      type: `string`,
      title: `Payer Parent Name`,
      description: `Name of the parent payer organization from MDM Hierarchy. Ultimate parent for organizational rollup reporting.`,
      meta: {
        cardinality: `medium`,
        display_priority: `high`,
        use_case: `Enterprise-level payer group analysis`,
        sample_values: [`UnitedHealth Group`, `Anthem Inc`, `Centene Corporation`]
      }
    },
    
    mdm_pbm_parent_id: {
      sql: `mdm_pbm_parent_id`,
      type: `string`,
      title: `PBM Parent ID`,
      description: `MDM identifier for the parent PBM organization from MCO Hierarchy. Used for PBM corporate structure analysis.`,
      meta: {
        business_key: true,
        cardinality: `low`,
        data_lineage: `MCO Hierarchy System`,
        use_case: `PBM parent-level aggregation`,
        related_dimensions: [`mdm_pbm_parent_name`, `mdm_pbm_id`]
      }
    },
    
    mdm_pbm_parent_name: {
      sql: `mdm_pbm_parent_name`,
      type: `string`,
      title: `PBM Parent Name`,
      description: `Name of the parent PBM organization from MCO Hierarchy. Top-level PBM organization for corporate rollup.`,
      meta: {
        cardinality: `low`,
        display_priority: `medium`,
        sample_values: [`CVS Health`, `Cigna`, `OptumRx Parent`]
      }
    },
    
    mdm_gpo_id: {
      sql: `mdm_gpo_id`,
      type: `string`,
      title: `GPO ID`,
      description: `Group Purchasing Organization identifier from MDM Hierarchy. Used for GPO relationship tracking.`,
      meta: {
        business_key: true,
        pii: false,
        cardinality: `low`,
        data_lineage: `MDM Hierarchy System`,
        use_case: `GPO affiliation analysis`,
        related_dimensions: [`mdm_gpo_name`]
      }
    },
    
    mdm_gpo_name: {
      sql: `mdm_gpo_name`,
      type: `string`,
      title: `GPO Name`,
      description: `Group Purchasing Organization name from MDM Hierarchy. Used for identifying GPO relationships and contracting.`,
      meta: {
        cardinality: `low`,
        sample_values: [`Premier`, `Vizient`, `HealthTrust`]
      }
    },
    
    mdm_gpo_parent_id: {
      sql: `mdm_gpo_parent_id`,
      type: `string`,
      title: `GPO Parent ID`,
      description: `Parent GPO organization identifier from MDM Hierarchy. For GPO corporate structure analysis.`,
      meta: {
        business_key: true,
        cardinality: `low`,
        data_lineage: `MDM Hierarchy System`
      }
    },
    
    mdm_gpo_parent_name: {
      sql: `mdm_gpo_parent_name`,
      type: `string`,
      title: `GPO Parent Name`,
      description: `Parent GPO organization name from MDM Hierarchy. Top-level GPO entity for organizational rollup.`,
      meta: {
        cardinality: `low`
      }
    },
    

    
    state_code: {
      sql: `state_code`,
      type: `string`,
      title: `State Code`,
      description: `Two-letter US state code pulled against postal code. Standard geographic dimension for state-level analysis.`,
      meta: {
        format: `Two-letter state abbreviation`,
        cardinality: `low`,
        sample_values: [`CA`, `NY`, `TX`, `FL`],
        data_quality_rule: `Must be valid US state abbreviation`,
        use_case: `State-level market analysis and compliance reporting`
      }
    },
    
    payer_360_hashkey: {
      sql: `payer_360_hashkey`,
      type: `string`,
      title: `Hash Key`,
      description: `Unique hash key generated from combination of all dimension columns. Used for data quality, deduplication, and change detection.`,
      meta: {
        technical_field: true,
        use_case: `Data quality validation and CDC (Change Data Capture)`,
        data_quality_rule: `Must be unique per grain of the table`
      }
    },
    
    oasis_load_time: {
      sql: `oasis_load_time`,
      type: `string`,
      title: `Load Timestamp`,
      description: `Timestamp when the record was loaded into the OASIS normalized table. Used for data lineage and troubleshooting.`,
      meta: {
        technical_field: true,
        format: `ISO 8601 timestamp`,
        use_case: `Data load auditing and troubleshooting`,
        data_quality_note: `Should be populated for all records`
      }
    }
  },

  // ========== SEGMENTS ==========
  segments: {
    current_commercial: {
      title: `Current Commercial Lives`,
      sql: `${CUBE.flag_current_record} = 'Y' AND ${CUBE.gne_book_of_business} = 'Commercial'`,
      meta: {
        use_case: `Most common analysis scenario for current commercial lives coverage`,
        description: `Pre-filtered segment for active commercial book of business analysis`
      }
    },
    
    ecosystem_level: {
      title: `Ecosystem Level Data`,
      sql: `${CUBE.geography_type} = 'ECOSYSTEM'`,
      meta: {
        use_case: `Regional/ecosystem level analysis excluding national aggregates`
      }
    },
    
    national_level: {
      title: `National Level Data`,
      sql: `${CUBE.geography_type} = 'NATIONAL'`,
      meta: {
        use_case: `National aggregate level analysis`
      }
    },
    
    drg_source: {
      title: `DRG Plan Source`,
      sql: `${CUBE.lives_source} = 'DRG Plan'`,
      meta: {
        use_case: `Analysis using DRG Plan as primary data source`,
        recommended: true
      }
    },
    
    pharmacy_benefit: {
      title: `Pharmacy Benefit Lives`,
      sql: `${CUBE.benefit_type} = 'Pharmacy Benefit'`,
      meta: {
        use_case: `Pharmacy-specific coverage analysis`
      }
    },
    
    medical_benefit: {
      title: `Medical Benefit Lives`,
      sql: `${CUBE.benefit_type} = 'Medical Benefit'`,
      meta: {
        use_case: `Medical-specific coverage analysis`
      }
    }
  },

  // ========== HIERARCHIES ==========
  // hierarchies: {
  //   payer_hierarchy: {
  //     title: `Payer Organizational Hierarchy`,
  //     levels: [`mdm_payer_parent_name`, `mdm_payer_name`, `mdm_plan_name`]
  //   },
    
  //   pbm_hierarchy: {
  //     title: `PBM Organizational Hierarchy`,
  //     levels: [`mdm_pbm_parent_name`, `mdm_pbm_name`]
  //   },
    
  //   geographic_hierarchy: {
  //     title: `Geographic Hierarchy`,
  //     levels: [`geography_type`, `commercial_region_name`, `ecosystem_name`, `state_code`, `zip`]
  //   },
    
  //   time_hierarchy: {
  //     title: `Time Hierarchy`,
  //     levels: [`date_year`, `date_year_quarter`, `date_year_month`]
  //   },
    
  //   book_of_business_hierarchy: {
  //     title: `Book of Business Hierarchy`,
  //     levels: [`gne_book_of_business`, `mdm_book_of_business`]
  //   }
  // }
});
