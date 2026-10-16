// Every metric in metricDefinitions.ts belongs to exactly one stage of block processing.
export const CHART_GROUPS: [group: string, metrics: string[]][] = [
  ['Build', [
    'latency/get_payload', 'latency/update_fork_choice', 'latency/send_txs', 'gas/per_block', 'transactions/per_block',
    'reth_base_builder_block_built_success', 'reth_base_builder_flashblock_count', 'reth_base_builder_flashblock_count_avg',
    'reth_base_builder_total_block_built_duration_avg', 'reth_base_builder_flashblock_build_duration_avg',
    'reth_base_builder_sequencer_tx_duration_avg', 'reth_base_builder_payload_transaction_simulation_duration_avg',
    'reth_base_builder_tx_simulation_duration_avg', 'reth_base_builder_payload_num_tx_gauge', 'reth_base_builder_flashblock_gas_headroom_pct_avg',
  ]],
  ['State root', [
    'reth_base_builder_state_root_calculation_duration_avg', 'reth_base_builder_state_root_calculation_duration_quantile_0_5',
    'reth_base_builder_state_root_calculation_duration_quantile_0_9', 'reth_base_builder_state_root_calculation_duration_quantile_0_99',
    'reth_base_builder_state_root_time_per_gas_ratio_quantile_0_9',
    'chain/account/updates.50-percentile', 'chain/account/hashes.50-percentile', 'chain/storage/updates.50-percentile',
  ]],
  ['Persist', [
    'reth_storage_providers_database_save_blocks_total_quantile_0_9', 'reth_storage_providers_database_save_blocks_block_count_last',
    'reth_storage_providers_database_save_blocks_commit_sf_quantile_0_9', 'reth_storage_providers_database_save_blocks_commit_mdbx_quantile_0_9',
    'reth_storage_providers_database_save_blocks_write_state_quantile_0_9', 'reth_storage_providers_database_save_blocks_write_hashed_state_quantile_0_9',
    'reth_storage_providers_database_save_blocks_write_trie_updates_quantile_0_9', 'reth_storage_providers_database_save_blocks_sf_quantile_0_9',
    'reth_db_freelist', 'chain/write.50-percentile', 'chain/account/commits.50-percentile', 'chain/storage/commits.50-percentile',
    'chain/snapshot/commits.50-percentile', 'chain/triedb/commits.50-percentile',
  ]],
  ['Sparse trie', [
    'reth_trie_leaves_added_quantile_0_9', 'reth_trie_branches_added_quantile_0_9',
    'reth_tree_root_sparse_trie_total_duration_histogram_quantile_0_9', 'reth_tree_root_sparse_trie_final_update_duration_histogram_quantile_0_9',
    'reth_parallel_sparse_trie_subtrie_hash_update_latency_quantile_0_9', 'reth_parallel_sparse_trie_subtrie_upper_hash_latency_quantile_0_9',
    'reth_trie_proof_task_storage_worker_idle_time_seconds_quantile_0_9', 'reth_trie_proof_task_account_worker_idle_time_seconds_quantile_0_9',
    'reth_trie_proof_task_blinded_storage_nodes_quantile_0_9', 'reth_trie_proof_task_blinded_account_nodes_quantile_0_9',
    'reth_trie_cursor_overall_duration_quantile_0_9', 'reth_trie_hashed_cursor_overall_duration_quantile_0_9',
  ]],
  ['Validate', [
    'latency/new_payload', 'reth_sync_execution_execution_duration_avg', 'reth_sync_block_validation_state_root_duration_avg',
    'reth_sync_state_provider_total_storage_fetch_latency_avg', 'reth_sync_state_provider_total_code_fetch_latency_avg',
    'reth_sync_state_provider_total_account_fetch_latency_avg',
    'chain/inserts.50-percentile', 'chain/account/reads.50-percentile', 'chain/storage/reads.50-percentile',
    'chain/execution.50-percentile', 'chain/validation.50-percentile', 'chain/crossvalidation.50-percentile',
  ]],
];
