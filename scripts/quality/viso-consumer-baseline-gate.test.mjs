import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_PACKAGES,
  CONSUMER_REPOSITORY,
  CONTRACTUAL_TEST_COUNT,
  EXPECTED_PAGE_FILES,
  EXPECTED_ROUTE_HANDLERS,
  VISO_RELATIONS,
  REQUIRED_EVIDENCE_FIELDS,
  SURFACES,
  containsSensitiveData,
  evaluateProfile,
  evaluateSurface,
  evidenceIsStale,
  resolveTargetPackages,
  sha256Identity,
  validateEvidence,
  validateRouteInventoryEntries,
} from './viso-consumer-baseline-gate.mjs';

const positiveSurfaceScenarios = Object.freeze({
  'VISO-SURFACE-001': {
    session: true,
    sso_bridge: true,
    safe_return: true,
    deny_state: true,
    app_access: true,
    permission: true,
    auth_error: false,
  },
  'VISO-SURFACE-002': {
    site_id: 'SITE-001',
    area_scope: true,
    actor_effective: 'EMP-001',
    territory_valid: true,
    override_authorized: true,
    shared_device_checked: true,
    manipulated: false,
  },
  'VISO-SURFACE-003': {
    page_count: 61,
    static_page_count: 48,
    dynamic_page_count: 13,
    protected_page_count: 59,
    public_controlled_count: 2,
    handler_count: 10,
    technical_pattern_count: 71,
    month_route_present: true,
    query_params_are_not_routes: true,
  },
  'VISO-SURFACE-004': {
    handler_count: 10,
    middleware_api_excluded: true,
    own_auth: true,
    own_authorization: true,
    own_context: true,
    input_validation: true,
    privilege_server_only: true,
  },
  'VISO-SURFACE-005': {
    roles_scoped: true,
    permissions_scoped: true,
    site_scoped: true,
    area_scoped: true,
    mutation_authorized: true,
    self_escalation: false,
  },
  'VISO-SURFACE-006': {
    business_scope: true,
    product_scope: true,
    menu_scope: true,
    collection_scope: true,
    order_consistent: true,
    resource_owned: true,
  },
  'VISO-SURFACE-007': {
    cms_scope: true,
    content_scope: true,
    media_type_valid: true,
    media_size_valid: true,
    media_destination_valid: true,
    media_owner_valid: true,
    storage_authorized: true,
  },
  'VISO-SURFACE-008': {
    staff_scope: true,
    vacancy_scope: true,
    document_scope: true,
    attendance_scope: true,
    sensitive_data_scoped: true,
    traceable: true,
  },
  'VISO-SURFACE-009': {
    schedule_week: true,
    schedule_month: true,
    calendar: true,
    dates_valid: true,
    blocks_valid: true,
    limits_valid: true,
    draft_publish_separate: true,
    parity_single_source: true,
  },
  'VISO-SURFACE-010': {
    operation_id: 'OP-001',
    idempotency_key: 'IDEMP-001',
    atomic_or_reconciliable: true,
    retry_safe: true,
    duplicate_effect: false,
    timeout_not_success: true,
    recovery_auditable: true,
  },
  'VISO-SURFACE-011': {
    contract_consumed: true,
    claimed_owner: 'viso_admin',
  },
  'VISO-SURFACE-012': {
    server_render: true,
    client_render: true,
    hydration_mismatch: false,
    interaction_ok: true,
    forms_ok: true,
    tables_ok: true,
    accessibility_ok: true,
    loading_error_feedback_ok: true,
    deny_state_safe: true,
  },
});

const negativeSurfaceScenarios = Object.freeze({
  'VISO-SURFACE-001': {
    session: false,
    sso_bridge: false,
    safe_return: false,
    deny_state: false,
    app_access: false,
    permission: false,
    auth_error: true,
  },
  'VISO-SURFACE-002': {
    site_id: 'SITE-OTHER',
    area_scope: false,
    actor_effective: 'EMP-001',
    territory_valid: false,
    override_authorized: false,
    shared_device_checked: false,
    manipulated: true,
  },
  'VISO-SURFACE-003': {
    page_count: 60,
    static_page_count: 47,
    dynamic_page_count: 13,
    protected_page_count: 58,
    public_controlled_count: 2,
    handler_count: 11,
    technical_pattern_count: 71,
    month_route_present: false,
    query_params_are_not_routes: false,
  },
  'VISO-SURFACE-004': {
    handler_count: 10,
    middleware_api_excluded: true,
    own_auth: false,
    own_authorization: false,
    own_context: false,
    input_validation: false,
    privilege_server_only: false,
  },
  'VISO-SURFACE-005': {
    roles_scoped: false,
    permissions_scoped: false,
    site_scoped: false,
    area_scoped: false,
    mutation_authorized: false,
    self_escalation: true,
  },
  'VISO-SURFACE-006': {
    business_scope: false,
    product_scope: false,
    menu_scope: false,
    collection_scope: false,
    order_consistent: false,
    resource_owned: false,
  },
  'VISO-SURFACE-007': {
    cms_scope: false,
    content_scope: false,
    media_type_valid: false,
    media_size_valid: false,
    media_destination_valid: false,
    media_owner_valid: false,
    storage_authorized: false,
  },
  'VISO-SURFACE-008': {
    staff_scope: false,
    vacancy_scope: false,
    document_scope: false,
    attendance_scope: false,
    sensitive_data_scoped: false,
    traceable: false,
  },
  'VISO-SURFACE-009': {
    schedule_week: false,
    schedule_month: false,
    calendar: false,
    dates_valid: false,
    blocks_valid: false,
    limits_valid: false,
    draft_publish_separate: false,
    parity_single_source: false,
  },
  'VISO-SURFACE-010': {
    operation_id: 'OP-001',
    idempotency_key: '',
    atomic_or_reconciliable: false,
    retry_safe: false,
    duplicate_effect: true,
    timeout_not_success: false,
    recovery_auditable: false,
  },
  'VISO-SURFACE-011': {
    contract_consumed: true,
    claimed_owner: 'inventory',
  },
  'VISO-SURFACE-012': {
    server_render: true,
    client_render: true,
    hydration_mismatch: true,
    interaction_ok: false,
    forms_ok: false,
    tables_ok: false,
    accessibility_ok: false,
    loading_error_feedback_ok: false,
    deny_state_safe: false,
  },
});

const positiveProfiles = Object.freeze({
  '@vento/contracts': {
    types_compile: true,
    payload_shapes_checked: true,
    serialization_checked: true,
    identifier_semantics_preserved: true,
    nullable_semantics_checked: true,
    no_global_cast_bypass: true,
  },
  '@vento/os-context': {
    session_checked: true,
    site_context_checked: true,
    area_context_checked: true,
    actor_context_checked: true,
    app_access_checked: true,
    permission_allow_checked: true,
    permission_deny_checked: true,
    role_override_checked: true,
    shared_device_checked: true,
    client_cannot_elevate_authority: true,
  },
  '@vento/supabase': {
    browser_client_checked: true,
    server_client_checked: true,
    admin_server_only_checked: true,
    permission_rpc_checked: true,
    rls_deny_checked: true,
    storage_checked: true,
    isolated_schema_source: true,
    no_service_role_fixture: true,
    no_service_role_client_exposure: true,
    build_is_non_mutating: true,
  },
  '@vento/ui-web': {
    server_render_checked: true,
    client_render_checked: true,
    hydration_checked: true,
    forms_checked: true,
    tables_checked: true,
    keyboard_focus_checked: true,
    accessibility_checked: true,
    loading_error_checked: true,
    deny_state_checked: true,
  },
});

for (const surface of SURFACES) {
  test(`POS ${surface.id} ${surface.name}`, () => {
    assert.equal(evaluateSurface(surface.id, positiveSurfaceScenarios[surface.id]), true);
  });
}

for (const surface of SURFACES) {
  test(`NEG ${surface.id} ${surface.name} falla cerrado`, () => {
    assert.equal(evaluateSurface(surface.id, negativeSurfaceScenarios[surface.id]), false);
  });
}

for (const packageName of CANONICAL_PACKAGES) {
  test(`PROFILE POS ${packageName}`, () => {
    assert.equal(evaluateProfile(packageName, positiveProfiles[packageName]), true);
  });
}

for (const packageName of CANONICAL_PACKAGES) {
  test(`PROFILE NEG ${packageName} no acepta cobertura incompleta`, () => {
    const incomplete = { ...positiveProfiles[packageName] };
    const firstKey = Object.keys(incomplete)[0];
    incomplete[firstKey] = false;
    assert.equal(evaluateProfile(packageName, incomplete), false);
  });
}

function validEvidence() {
  const targetPackageSet = [...CANONICAL_PACKAGES];
  const identity = sha256Identity('fixture');
  return {
    consumer_repository: CONSUMER_REPOSITORY,
    consumer_branch: 'main',
    consumer_base_commit: '1'.repeat(40),
    consumer_manifest_identity: identity,
    consumer_lockfile_identity: identity,
    test_contract_identity: identity,
    test_suite_identity: identity,
    fixture_set_identity: identity,
    route_inventory_identity: identity,
    handler_inventory_identity: identity,
    source_contract_identity: identity,
    environment_identity: 'isolated:win32:x64:node:v24.19.0',
    runtime_identity: 'v24.19.0',
    framework_identity: 'node:test+ci011-policy-engine-v1',
    target_package_set: targetPackageSet,
    compatibility_refs: targetPackageSet.map(
      (packageName) => VISO_RELATIONS[packageName].compatibility_ref,
    ),
    viso_profile_set: targetPackageSet.map(
      (packageName) => VISO_RELATIONS[packageName].profile,
    ),
    execution_identity: identity,
    started_at: '2026-08-18T08:42:00-05:00',
    completed_at: '2026-08-18T08:43:00-05:00',
    result: 'PASS',
    invalidation_reason: null,
    certification_scope: 'HARNESS_SELF_CERTIFICATION',
    consumer_conformance_claimed: false,
    safe_build_entrypoint: 'npm run build:ci011',
    implementation_boundaries: {
      package_versions_changed: false,
      supabase_mutation_performed: false,
      production_data_used: false,
      consumer_functional_debt_corrected: false,
    },
    test_summary: {
      executed: CONTRACTUAL_TEST_COUNT,
      passed: CONTRACTUAL_TEST_COUNT,
      failed: 0,
      skipped: 0,
      denied_paths: 16,
    },
  };
}

test('REG-01 evidencia válida tiene todos los campos contractuales', () => {
  const evidence = validEvidence();
  for (const field of REQUIRED_EVIDENCE_FIELDS) assert.ok(field in evidence);
  assert.deepEqual(validateEvidence(evidence), []);
});

test('REG-02 cero tests jamás se normaliza a PASS', () => {
  const evidence = validEvidence();
  evidence.test_summary.executed = 0;
  assert.ok(validateEvidence(evidence).includes('ZERO_REQUIRED_TESTS'));
});

test('REG-03 evidencia de otro consumidor jamás satisface VISO', () => {
  const evidence = validEvidence();
  evidence.consumer_repository = 'devVentoGroup/vento-origo';
  assert.ok(validateEvidence(evidence).includes('WRONG_CONSUMER_REPOSITORY'));
});

test('REG-04 cambiar commit vuelve STALE la evidencia', () => {
  const previous = validEvidence();
  const current = { ...previous, consumer_base_commit: '2'.repeat(40) };
  assert.equal(evidenceIsStale(previous, current), true);
});

test('REG-05 cambiar target package set vuelve STALE la evidencia', () => {
  const previous = validEvidence();
  const current = {
    ...previous,
    target_package_set: ['@vento/contracts'],
    compatibility_refs: ['PKG-COMP-MX-002'],
    viso_profile_set: ['VISO-PROFILE-CONTRACTS'],
  };
  assert.equal(evidenceIsStale(previous, current), true);
});

test('REG-06 entorno productivo queda bloqueado', () => {
  const evidence = validEvidence();
  evidence.environment_identity = 'production:remote';
  assert.ok(validateEvidence(evidence).includes('PRODUCTION_ENVIRONMENT_FORBIDDEN'));
});

test('REG-07 secretos reales o con forma de secreto quedan bloqueados', () => {
  assert.equal(containsSensitiveData({ password: 'synthetic-fixture-password-12345678' }), true);
});

test('REG-08 conjunto multi-package conserva orden canónico y perfiles exactos', () => {
  assert.deepEqual(
    resolveTargetPackages('@vento/ui-web,@vento/contracts,@vento/supabase'),
    ['@vento/contracts', '@vento/supabase', '@vento/ui-web'],
  );
});

test('REG-09 inventario exacto acepta 61 páginas, 48 estáticas, 13 dinámicas, 59 protegidas, 2 públicas, 10 handlers y 71 patrones', () => {
  const result = validateRouteInventoryEntries(EXPECTED_PAGE_FILES, EXPECTED_ROUTE_HANDLERS);
  assert.equal(result.result, 'PASS');
  assert.equal(result.actual_page_count, 61);
  assert.equal(result.actual_static_page_count, 48);
  assert.equal(result.actual_dynamic_page_count, 13);
  assert.equal(result.actual_protected_page_count, 59);
  assert.equal(result.actual_public_controlled_count, 2);
  assert.equal(result.actual_handler_count, 10);
  assert.equal(result.actual_technical_pattern_count, 71);
  assert.equal(result.month_route_present, true);
  assert.equal(result.public_routes_exact, true);
});

test('REG-10 inventario con drift de páginas o handlers queda bloqueado', () => {
  const pages = EXPECTED_PAGE_FILES.filter((entry) => entry !== 'src/app/page.tsx');
  pages.push('src/app/extra/page.tsx');
  const handlers = [...EXPECTED_ROUTE_HANDLERS, 'src/app/api/extra/route.ts'];
  const result = validateRouteInventoryEntries(pages, handlers);
  assert.equal(result.result, 'BLOCKED');
  assert.ok(result.missing_pages.includes('src/app/page.tsx'));
  assert.ok(result.unexpected_pages.includes('src/app/extra/page.tsx'));
  assert.ok(result.unexpected_handlers.includes('src/app/api/extra/route.ts'));
});
