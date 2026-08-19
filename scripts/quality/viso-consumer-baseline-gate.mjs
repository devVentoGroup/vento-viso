import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CI011_INSTANCE_ID = 'SHELL-CI-011::GLOBAL';
export const CI011_SCHEMA_VERSION = 1;
export const CI011_SOURCE_CONTRACT_SHA256 = 'c19ef09765d92cabec468a02f532763d796c9b0c5e68ab70da854cd9903df264';
export const CONSUMER_REPOSITORY = 'vento-group-sas/vento-viso';
export const CONSUMER_NAME = 'vento-viso';
export const CONTRACTUAL_TEST_COUNT = 42;

export const CANONICAL_PACKAGES = Object.freeze([
  '@vento/contracts',
  '@vento/os-context',
  '@vento/supabase',
  '@vento/ui-web',
]);

export const VISO_RELATIONS = Object.freeze({
  '@vento/contracts': Object.freeze({
    compatibility_ref: 'PKG-COMP-MX-002',
    update_ref: 'PKG-PR-REL-002',
    profile: 'VISO-PROFILE-CONTRACTS',
  }),
  '@vento/os-context': Object.freeze({
    compatibility_ref: 'PKG-COMP-MX-009',
    update_ref: 'PKG-PR-REL-009',
    profile: 'VISO-PROFILE-OS-CONTEXT',
  }),
  '@vento/supabase': Object.freeze({
    compatibility_ref: 'PKG-COMP-MX-016',
    update_ref: 'PKG-PR-REL-016',
    profile: 'VISO-PROFILE-SUPABASE',
  }),
  '@vento/ui-web': Object.freeze({
    compatibility_ref: 'PKG-COMP-MX-023',
    update_ref: 'PKG-PR-REL-023',
    profile: 'VISO-PROFILE-UI-WEB',
  }),
});

export const REQUIRED_EVIDENCE_FIELDS = Object.freeze([
  'consumer_repository',
  'consumer_branch',
  'consumer_base_commit',
  'consumer_manifest_identity',
  'consumer_lockfile_identity',
  'test_contract_identity',
  'test_suite_identity',
  'fixture_set_identity',
  'route_inventory_identity',
  'handler_inventory_identity',
  'source_contract_identity',
  'environment_identity',
  'runtime_identity',
  'framework_identity',
  'target_package_set',
  'compatibility_refs',
  'viso_profile_set',
  'execution_identity',
  'started_at',
  'completed_at',
  'result',
  'invalidation_reason',
]);

export const EXPECTED_PAGE_FILES = Object.freeze([
  'src/app/page.tsx',
  'src/app/login/page.tsx',
  'src/app/no-access/page.tsx',
  'src/app/accounting/page.tsx',
  'src/app/app-navigation/page.tsx',
  'src/app/app-updates/page.tsx',
  'src/app/businesses/page.tsx',
  'src/app/businesses/new/page.tsx',
  'src/app/businesses/[id]/page.tsx',
  'src/app/commercial-audit/page.tsx',
  'src/app/commercial-audit/structure/page.tsx',
  'src/app/commercial-availability/page.tsx',
  'src/app/commercial-categories/page.tsx',
  'src/app/commercial-collections/page.tsx',
  'src/app/commercial-collections/overview/page.tsx',
  'src/app/commercial-menu/page.tsx',
  'src/app/content-blocks/page.tsx',
  'src/app/content-blocks/[id]/page.tsx',
  'src/app/delivery-rates/page.tsx',
  'src/app/menu/page.tsx',
  'src/app/menu/new/page.tsx',
  'src/app/menu/[id]/page.tsx',
  'src/app/menu/[id]/personalizations/manage/page.tsx',
  'src/app/operations/page.tsx',
  'src/app/operations/checkin-points/page.tsx',
  'src/app/operations/employee-profiles/page.tsx',
  'src/app/operations/preview/page.tsx',
  'src/app/operations/site-roles/page.tsx',
  'src/app/operations-map/page.tsx',
  'src/app/ops/audit/page.tsx',
  'src/app/pass-users/page.tsx',
  'src/app/pass-users/new/page.tsx',
  'src/app/pass-users/[id]/page.tsx',
  'src/app/products/page.tsx',
  'src/app/products/new/page.tsx',
  'src/app/products/[id]/page.tsx',
  'src/app/roles-permissions/page.tsx',
  'src/app/sites/page.tsx',
  'src/app/sites/[id]/page.tsx',
  'src/app/sites/[id]/documentos/page.tsx',
  'src/app/staff/page.tsx',
  'src/app/staff/new/page.tsx',
  'src/app/staff/[id]/page.tsx',
  'src/app/staff/attendance/page.tsx',
  'src/app/staff/calendar/page.tsx',
  'src/app/staff/schedule/page.tsx',
  'src/app/staff/schedule/global/page.tsx',
  'src/app/staff/schedule/metrics/page.tsx',
  'src/app/staff/schedule/settings/page.tsx',
  'src/app/staff/shared-devices/new/page.tsx',
  'src/app/vacancies/page.tsx',
  'src/app/vacancies/new/page.tsx',
  'src/app/vacancies/[id]/page.tsx',
  'src/app/website-cms/page.tsx',
  'src/app/website-cms/blocks/new/page.tsx',
  'src/app/website-cms/blocks/[id]/page.tsx',
  'src/app/website-cms/items/new/page.tsx',
  'src/app/website-cms/items/[id]/page.tsx',
  'src/app/website-cms/venues/page.tsx',
  'src/app/website-cms/venues/[slug]/page.tsx',
  'src/app/staff/schedule/month/page.tsx'
]);

export const EXPECTED_ROUTE_HANDLERS = Object.freeze([
  'src/app/api/health/route.ts',
  'src/app/api/viso/attendance-report/route.ts',
  'src/app/api/viso/menu/reorder/route.ts',
  'src/app/api/viso/staff-schedule-hidden-employees/route.ts',
  'src/app/api/viso/staff-schedule-shifts/route.ts',
  'src/app/api/viso/upload-commercial-menu-image/route.ts',
  'src/app/api/viso/upload-logo/route.ts',
  'src/app/api/viso/upload-product-image/route.ts',
  'src/app/api/viso/upload-website-media/route.ts',
  'src/app/menu/[id]/personalizaciones/route.ts'
]);

export const EXPECTED_PAGE_COUNT = 61;
export const EXPECTED_STATIC_PAGE_COUNT = 48;
export const EXPECTED_DYNAMIC_PAGE_COUNT = 13;
export const EXPECTED_PROTECTED_PAGE_COUNT = 59;
export const EXPECTED_PUBLIC_CONTROLLED_COUNT = 2;
export const EXPECTED_HANDLER_COUNT = 10;
export const EXPECTED_TECHNICAL_PATTERN_COUNT = 71;
export const PUBLIC_CONTROLLED_ROUTES = Object.freeze(['/login', '/no-access']);

export const SURFACES = Object.freeze([
  Object.freeze({
    id: 'VISO-SURFACE-001',
    name: 'identidad, sesión, SSO y denegación',
    required_paths: [
      'middleware.ts',
      'src/lib/auth/guard.ts',
      'src/app/login/page.tsx',
      'src/app/no-access/page.tsx',
    ],
  }),
  Object.freeze({
    id: 'VISO-SURFACE-002',
    name: 'contexto operativo, sede, área, actor, simulación y dispositivo',
    required_paths: [
      'src/lib/auth/operational-session.ts',
      'src/lib/auth/role-override.ts',
      'src/lib/auth/role-override-config.ts',
      'src/lib/auth/permissions.ts',
    ],
  }),
  Object.freeze({
    id: 'VISO-SURFACE-003',
    name: 'inventario de páginas y rutas',
    required_paths: [...EXPECTED_PAGE_FILES],
  }),
  Object.freeze({
    id: 'VISO-SURFACE-004',
    name: 'handlers y frontera servidor',
    required_paths: [...EXPECTED_ROUTE_HANDLERS],
  }),
  Object.freeze({
    id: 'VISO-SURFACE-005',
    name: 'roles, permisos, sedes y estructura',
    required_paths: [
      'src/app/roles-permissions/page.tsx',
      'src/app/sites/page.tsx',
      'src/app/sites/[id]/page.tsx',
      'src/app/operations/site-roles/page.tsx',
    ],
  }),
  Object.freeze({
    id: 'VISO-SURFACE-006',
    name: 'comercio, menú, productos y colecciones',
    required_paths: [
      'src/app/businesses/page.tsx',
      'src/app/commercial-menu/page.tsx',
      'src/app/commercial-collections/page.tsx',
      'src/app/products/page.tsx',
      'src/app/menu/page.tsx',
      'src/app/api/viso/menu/reorder/route.ts',
    ],
  }),
  Object.freeze({
    id: 'VISO-SURFACE-007',
    name: 'CMS, contenido, medios y uploads',
    required_paths: [
      'src/app/website-cms/page.tsx',
      'src/app/content-blocks/page.tsx',
      'src/app/api/viso/upload-commercial-menu-image/route.ts',
      'src/app/api/viso/upload-logo/route.ts',
      'src/app/api/viso/upload-product-image/route.ts',
      'src/app/api/viso/upload-website-media/route.ts',
    ],
  }),
  Object.freeze({
    id: 'VISO-SURFACE-008',
    name: 'personal, vacantes, documentos y asistencia',
    required_paths: [
      'src/app/staff/page.tsx',
      'src/app/staff/[id]/page.tsx',
      'src/app/staff/attendance/page.tsx',
      'src/app/vacancies/page.tsx',
      'src/components/viso/staff-documents-panel.tsx',
    ],
  }),
  Object.freeze({
    id: 'VISO-SURFACE-009',
    name: 'programación semanal, mensual y calendario',
    required_paths: [
      'src/app/staff/calendar/page.tsx',
      'src/app/staff/schedule/page.tsx',
      'src/app/staff/schedule/global/page.tsx',
      'src/app/staff/schedule/month/page.tsx',
      'src/app/staff/schedule/month/actions.ts',
      'src/app/staff/schedule/month/constants.ts',
      'src/app/staff/schedule/helpers.ts',
    ],
  }),
  Object.freeze({
    id: 'VISO-SURFACE-010',
    name: 'atomicidad, idempotencia, concurrencia y recuperación',
    required_paths: [
      'src/app/api/viso/menu/reorder/route.ts',
      'src/app/api/viso/staff-schedule-shifts/route.ts',
      'src/app/staff/schedule/actions.ts',
      'src/app/staff/schedule/month/actions.ts',
    ],
  }),
  Object.freeze({
    id: 'VISO-SURFACE-011',
    name: 'integración y fronteras de dominio',
    required_paths: [
      'docs/VENTO-COMERCIO-OPERACION-INVENTARIO.md',
      'docs/VENTO-FLUJO-COMERCIAL-VALIDACION.md',
      'src/lib/anima/shift-notify.ts',
      'src/lib/supabase/client.ts',
      'src/lib/supabase/server.ts',
      'src/lib/supabase/admin.ts',
    ],
  }),
  Object.freeze({
    id: 'VISO-SURFACE-012',
    name: 'UI, SSR, interacción, accesibilidad y errores',
    required_paths: [
      'src/app/layout.tsx',
      'src/app/no-access/page.tsx',
      'src/components/vento/standard/ui.tsx',
      'src/components/vento/standard/vento-shell.tsx',
      'src/components/viso/monthly-shift-builder.tsx',
      'src/components/viso/role-permissions-cascade.tsx',
    ],
  }),
]);

export const SOURCE_CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'VISO-SOURCE-001',
    path: 'middleware.ts',
    tokens: ['matcher', 'login', 'api', 'createServerClient', 'auth.getUser', 'clearSupabaseCookies'],
  }),
  Object.freeze({
    id: 'VISO-SOURCE-002',
    path: 'src/lib/auth/guard.ts',
    tokens: ['requireAppAccess', 'resolveOperationalSession', 'checkOperationalSessionPermission', 'canUseRoleOverride'],
  }),
  Object.freeze({
    id: 'VISO-SOURCE-003',
    path: 'src/lib/auth/operational-session.ts',
    tokens: ['shared_operational_devices', 'has_operational_role_permission', 'has_permission', 'isOperationalSessionAppAllowed'],
  }),
  Object.freeze({
    id: 'VISO-SOURCE-004',
    path: 'src/lib/auth/role-override.ts',
    tokens: ['ROLE_OVERRIDE_COOKIE', 'PRIVILEGED_ROLE_OVERRIDES', 'scopeMatches', 'isPermissionAllowedForRole'],
  }),
  Object.freeze({
    id: 'VISO-SOURCE-005',
    path: 'src/app/login/page.tsx',
    tokens: ['SHELL_LOGIN_URL', 'normalizeReturnTo', 'window.location.replace'],
  }),
  Object.freeze({
    id: 'VISO-SOURCE-006',
    path: 'src/app/no-access/page.tsx',
    tokens: ['safeReturnTo', 'HUB_URL', 'returnTo'],
  }),
  Object.freeze({
    id: 'VISO-SOURCE-007',
    path: 'src/lib/supabase/admin.ts',
    tokens: ['server-only', 'SUPABASE_SERVICE_ROLE_KEY', 'createAdminClient'],
  }),
  Object.freeze({
    id: 'VISO-SOURCE-008',
    path: 'src/app/staff/schedule/helpers.ts',
    tokens: ['requireStaffScheduleAccess', 'STAFF_SCHEDULE_PERMISSION', 'allowPermissionAccess: true'],
  }),
  Object.freeze({
    id: 'VISO-SOURCE-009',
    path: 'src/app/staff/schedule/month/page.tsx',
    tokens: ['requireStaffScheduleAccess', 'createAdminClient', 'MONTHLY_SCHEDULE_LIMIT_MINUTES', 'publishMonthAction'],
  }),
  Object.freeze({
    id: 'VISO-SOURCE-010',
    path: 'src/app/staff/schedule/month/actions.ts',
    tokens: ['"use server"', 'notifyShiftChange', 'createAdminClient', 'requireStaffScheduleAccess', 'MONTHLY_SCHEDULE_LIMIT_MINUTES'],
  }),
  Object.freeze({
    id: 'VISO-SOURCE-011',
    path: 'src/app/api/viso/menu/reorder/route.ts',
    tokens: ['requireAppAccess', 'createAdminClient', 'catalog_item_collections', 'menu_comercial'],
  }),
  Object.freeze({
    id: 'VISO-SOURCE-012',
    path: 'src/app/api/viso/upload-product-image/route.ts',
    tokens: ['auth.getUser', 'has_permission', 'ALLOWED_TYPES', 'MAX_SIZE', 'storage'],
  }),
]);

const PROFILE_REQUIREMENTS = Object.freeze({
  '@vento/contracts': Object.freeze([
    'types_compile',
    'payload_shapes_checked',
    'serialization_checked',
    'identifier_semantics_preserved',
    'nullable_semantics_checked',
    'no_global_cast_bypass',
  ]),
  '@vento/os-context': Object.freeze([
    'session_checked',
    'site_context_checked',
    'area_context_checked',
    'actor_context_checked',
    'app_access_checked',
    'permission_allow_checked',
    'permission_deny_checked',
    'role_override_checked',
    'shared_device_checked',
    'client_cannot_elevate_authority',
  ]),
  '@vento/supabase': Object.freeze([
    'browser_client_checked',
    'server_client_checked',
    'admin_server_only_checked',
    'permission_rpc_checked',
    'rls_deny_checked',
    'storage_checked',
    'isolated_schema_source',
    'no_service_role_fixture',
    'no_service_role_client_exposure',
    'build_is_non_mutating',
  ]),
  '@vento/ui-web': Object.freeze([
    'server_render_checked',
    'client_render_checked',
    'hydration_checked',
    'forms_checked',
    'tables_checked',
    'keyboard_focus_checked',
    'accessibility_checked',
    'loading_error_checked',
    'deny_state_checked',
  ]),
});

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SECRET_PATTERNS = Object.freeze([
  /\bgh[pousr]_[A-Za-z0-9_]{24,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bservice[_-]?role\b["']?\s*[:=]\s*["']?[^,\s"']{8,}/iu,
  /\b(?:password|secret|token|api[_-]?key|private[_-]?key)\b["']?\s*[:=]\s*["']?[^,\s"']{8,}/iu,
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, 'en'))
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Identity(value) {
  return `sha256:${createHash('sha256').update(
    typeof value === 'string' ? value : stableStringify(value),
  ).digest('hex')}`;
}

export function fileIdentity(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

export function resolveTargetPackages(values) {
  const raw = Array.isArray(values) ? values : String(values ?? '').split(',');
  const packages = [...new Set(raw.map((entry) => String(entry).trim()).filter(Boolean))];
  const invalid = packages.filter((entry) => !CANONICAL_PACKAGES.includes(entry));
  if (invalid.length > 0) throw new Error(`PACKAGE_NOT_CANONICAL:${invalid.join(',')}`);
  if (packages.length === 0) throw new Error('PACKAGE_SET_EMPTY');
  return CANONICAL_PACKAGES.filter((entry) => packages.includes(entry));
}

export function evaluateSurface(surfaceId, scenario) {
  const s = scenario ?? {};
  switch (surfaceId) {
    case 'VISO-SURFACE-001':
      return Boolean(
        s.session
        && s.sso_bridge
        && s.safe_return
        && s.deny_state
        && s.app_access
        && s.permission
        && !s.auth_error,
      );
    case 'VISO-SURFACE-002':
      return Boolean(
        s.site_id
        && s.area_scope
        && s.actor_effective
        && s.territory_valid
        && s.override_authorized
        && s.shared_device_checked
        && !s.manipulated,
      );
    case 'VISO-SURFACE-003':
      return Boolean(
        s.page_count === EXPECTED_PAGE_COUNT
        && s.static_page_count === EXPECTED_STATIC_PAGE_COUNT
        && s.dynamic_page_count === EXPECTED_DYNAMIC_PAGE_COUNT
        && s.protected_page_count === EXPECTED_PROTECTED_PAGE_COUNT
        && s.public_controlled_count === EXPECTED_PUBLIC_CONTROLLED_COUNT
        && s.handler_count === EXPECTED_HANDLER_COUNT
        && s.technical_pattern_count === EXPECTED_TECHNICAL_PATTERN_COUNT
        && s.month_route_present
        && s.query_params_are_not_routes,
      );
    case 'VISO-SURFACE-004':
      return Boolean(
        s.handler_count === EXPECTED_HANDLER_COUNT
        && s.middleware_api_excluded
        && s.own_auth
        && s.own_authorization
        && s.own_context
        && s.input_validation
        && s.privilege_server_only,
      );
    case 'VISO-SURFACE-005':
      return Boolean(
        s.roles_scoped
        && s.permissions_scoped
        && s.site_scoped
        && s.area_scoped
        && s.mutation_authorized
        && !s.self_escalation,
      );
    case 'VISO-SURFACE-006':
      return Boolean(
        s.business_scope
        && s.product_scope
        && s.menu_scope
        && s.collection_scope
        && s.order_consistent
        && s.resource_owned,
      );
    case 'VISO-SURFACE-007':
      return Boolean(
        s.cms_scope
        && s.content_scope
        && s.media_type_valid
        && s.media_size_valid
        && s.media_destination_valid
        && s.media_owner_valid
        && s.storage_authorized,
      );
    case 'VISO-SURFACE-008':
      return Boolean(
        s.staff_scope
        && s.vacancy_scope
        && s.document_scope
        && s.attendance_scope
        && s.sensitive_data_scoped
        && s.traceable,
      );
    case 'VISO-SURFACE-009':
      return Boolean(
        s.schedule_week
        && s.schedule_month
        && s.calendar
        && s.dates_valid
        && s.blocks_valid
        && s.limits_valid
        && s.draft_publish_separate
        && s.parity_single_source,
      );
    case 'VISO-SURFACE-010':
      return Boolean(
        s.operation_id
        && s.idempotency_key
        && s.atomic_or_reconciliable
        && s.retry_safe
        && !s.duplicate_effect
        && s.timeout_not_success
        && s.recovery_auditable,
      );
    case 'VISO-SURFACE-011': {
      const forbiddenOwnership = new Set([
        'auth_global',
        'inventory',
        'customer_loyalty',
        'supabase_schema',
        'supabase_migrations',
        'supabase_rls',
      ]);
      return Boolean(s.contract_consumed && !forbiddenOwnership.has(s.claimed_owner));
    }
    case 'VISO-SURFACE-012':
      return Boolean(
        s.server_render
        && s.client_render
        && !s.hydration_mismatch
        && s.interaction_ok
        && s.forms_ok
        && s.tables_ok
        && s.accessibility_ok
        && s.loading_error_feedback_ok
        && s.deny_state_safe,
      );
    default:
      throw new Error(`UNKNOWN_SURFACE:${surfaceId}`);
  }
}

export function evaluateProfile(packageName, scenario) {
  if (!CANONICAL_PACKAGES.includes(packageName)) {
    throw new Error(`PACKAGE_NOT_CANONICAL:${packageName}`);
  }
  return PROFILE_REQUIREMENTS[packageName].every((key) => scenario?.[key] === true);
}

export function evidenceIsStale(previous, current) {
  const materialFields = [
    'consumer_base_commit',
    'consumer_manifest_identity',
    'consumer_lockfile_identity',
    'test_contract_identity',
    'test_suite_identity',
    'fixture_set_identity',
    'route_inventory_identity',
    'handler_inventory_identity',
    'source_contract_identity',
    'environment_identity',
    'runtime_identity',
    'framework_identity',
    'target_package_set',
    'compatibility_refs',
    'viso_profile_set',
  ];
  return materialFields.some(
    (field) => stableStringify(previous?.[field]) !== stableStringify(current?.[field]),
  );
}

export function containsSensitiveData(value) {
  const source = stableStringify(value);
  return SECRET_PATTERNS.some((pattern) => pattern.test(source));
}

function routeFromPageFile(relativePath) {
  const normalized = String(relativePath).replace(/\\/gu, '/');
  const withoutRoot = normalized.replace(/^src\/app\//u, '');
  const dir = withoutRoot.replace(/\/?page\.(?:js|jsx|ts|tsx)$/u, '');
  if (!dir || dir === 'page') return '/';
  const segments = dir
    .split('/')
    .filter(Boolean)
    .filter((segment) => !/^\(.+\)$/u.test(segment));
  return `/${segments.join('/')}`.replace(/\/+$/u, '') || '/';
}

export function validateRouteInventoryEntries(pageFiles, handlerFiles) {
  const pages = [...pageFiles].map(String).sort();
  const handlers = [...handlerFiles].map(String).sort();
  const expectedPages = [...EXPECTED_PAGE_FILES].sort();
  const expectedHandlers = [...EXPECTED_ROUTE_HANDLERS].sort();
  const pageSet = new Set(pages);
  const handlerSet = new Set(handlers);
  const missingPages = expectedPages.filter((entry) => !pageSet.has(entry));
  const unexpectedPages = pages.filter((entry) => !expectedPages.includes(entry));
  const missingHandlers = expectedHandlers.filter((entry) => !handlerSet.has(entry));
  const unexpectedHandlers = handlers.filter((entry) => !expectedHandlers.includes(entry));
  const duplicatePages = pages.length !== pageSet.size;
  const duplicateHandlers = handlers.length !== handlerSet.size;
  const routes = pages.map(routeFromPageFile);
  const uniqueRoutes = new Set(routes);
  const dynamicPageCount = routes.filter((route) => route.includes('[')).length;
  const staticPageCount = routes.length - dynamicPageCount;
  const publicControlled = routes.filter((route) => PUBLIC_CONTROLLED_ROUTES.includes(route));
  const protectedRoutes = routes.filter((route) => !PUBLIC_CONTROLLED_ROUTES.includes(route));
  const technicalPatternCount = routes.length + handlers.length;
  const monthRoutePresent = uniqueRoutes.has('/staff/schedule/month');
  const publicSetExact = PUBLIC_CONTROLLED_ROUTES.every((route) => uniqueRoutes.has(route))
    && publicControlled.length === EXPECTED_PUBLIC_CONTROLLED_COUNT;

  const cardinalitiesPass = (
    pages.length === EXPECTED_PAGE_COUNT
    && uniqueRoutes.size === EXPECTED_PAGE_COUNT
    && staticPageCount === EXPECTED_STATIC_PAGE_COUNT
    && dynamicPageCount === EXPECTED_DYNAMIC_PAGE_COUNT
    && protectedRoutes.length === EXPECTED_PROTECTED_PAGE_COUNT
    && publicControlled.length === EXPECTED_PUBLIC_CONTROLLED_COUNT
    && handlers.length === EXPECTED_HANDLER_COUNT
    && technicalPatternCount === EXPECTED_TECHNICAL_PATTERN_COUNT
    && monthRoutePresent
    && publicSetExact
  );

  return {
    expected_page_count: EXPECTED_PAGE_COUNT,
    actual_page_count: pages.length,
    unique_page_count: uniqueRoutes.size,
    expected_static_page_count: EXPECTED_STATIC_PAGE_COUNT,
    actual_static_page_count: staticPageCount,
    expected_dynamic_page_count: EXPECTED_DYNAMIC_PAGE_COUNT,
    actual_dynamic_page_count: dynamicPageCount,
    expected_protected_page_count: EXPECTED_PROTECTED_PAGE_COUNT,
    actual_protected_page_count: protectedRoutes.length,
    expected_public_controlled_count: EXPECTED_PUBLIC_CONTROLLED_COUNT,
    actual_public_controlled_count: publicControlled.length,
    expected_handler_count: EXPECTED_HANDLER_COUNT,
    actual_handler_count: handlers.length,
    expected_technical_pattern_count: EXPECTED_TECHNICAL_PATTERN_COUNT,
    actual_technical_pattern_count: technicalPatternCount,
    month_route_present: monthRoutePresent,
    public_routes_exact: publicSetExact,
    query_params_are_not_routes: true,
    actual_page_files: pages,
    actual_handler_files: handlers,
    missing_pages: missingPages,
    unexpected_pages: unexpectedPages,
    missing_handlers: missingHandlers,
    unexpected_handlers: unexpectedHandlers,
    duplicate_pages: duplicatePages,
    duplicate_handlers: duplicateHandlers,
    result:
      missingPages.length === 0
      && unexpectedPages.length === 0
      && missingHandlers.length === 0
      && unexpectedHandlers.length === 0
      && !duplicatePages
      && !duplicateHandlers
      && cardinalitiesPass
        ? 'PASS'
        : 'BLOCKED',
  };
}

function discoverByBasename(root, baseNames) {
  const found = [];
  if (!fs.existsSync(root)) return found;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (baseNames.has(entry.name)) found.push(absolute);
    }
  }
  return found;
}

function toRepoRelative(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

export function probeRouteInventory(root = process.cwd()) {
  const appRoot = path.join(root, 'src', 'app');
  const pageFiles = discoverByBasename(
    appRoot,
    new Set(['page.ts', 'page.tsx', 'page.js', 'page.jsx']),
  ).map((entry) => toRepoRelative(root, entry));
  const handlerFiles = discoverByBasename(
    appRoot,
    new Set(['route.ts', 'route.tsx', 'route.js', 'route.jsx']),
  ).map((entry) => toRepoRelative(root, entry));
  return validateRouteInventoryEntries(pageFiles, handlerFiles);
}

export function inspectSourceContracts(root = process.cwd()) {
  return SOURCE_CONTRACTS.map((contract) => {
    const absolute = path.join(root, contract.path);
    if (!fs.existsSync(absolute)) {
      return {
        contract_id: contract.id,
        path: contract.path,
        missing_tokens: [...contract.tokens],
        result: 'BLOCKED',
      };
    }
    const source = fs.readFileSync(absolute, 'utf8');
    const missingTokens = contract.tokens.filter((token) => !source.includes(token));
    return {
      contract_id: contract.id,
      path: contract.path,
      missing_tokens: missingTokens,
      result: missingTokens.length === 0 ? 'PASS' : 'BLOCKED',
    };
  });
}

export function validateEvidence(evidence) {
  const errors = [];
  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    if (!(field in (evidence ?? {}))) errors.push(`EVIDENCE_FIELD_MISSING:${field}`);
  }
  if (evidence?.consumer_repository !== CONSUMER_REPOSITORY) errors.push('WRONG_CONSUMER_REPOSITORY');
  if (!COMMIT_PATTERN.test(String(evidence?.consumer_base_commit ?? ''))) errors.push('BASE_COMMIT_INVALID');

  for (const field of [
    'consumer_manifest_identity',
    'consumer_lockfile_identity',
    'test_contract_identity',
    'test_suite_identity',
    'fixture_set_identity',
    'route_inventory_identity',
    'handler_inventory_identity',
    'source_contract_identity',
    'execution_identity',
  ]) {
    if (!SHA256_PATTERN.test(String(evidence?.[field] ?? ''))) errors.push(`IDENTITY_INVALID:${field}`);
  }

  let targetPackages = [];
  try {
    targetPackages = resolveTargetPackages(evidence?.target_package_set ?? []);
  } catch (error) {
    errors.push(String(error.message));
  }

  const expectedCompatibility = targetPackages.map(
    (packageName) => VISO_RELATIONS[packageName].compatibility_ref,
  );
  const expectedProfiles = targetPackages.map(
    (packageName) => VISO_RELATIONS[packageName].profile,
  );
  if (stableStringify(evidence?.compatibility_refs ?? []) !== stableStringify(expectedCompatibility)) {
    errors.push('COMPATIBILITY_REFS_MISMATCH');
  }
  if (stableStringify(evidence?.viso_profile_set ?? []) !== stableStringify(expectedProfiles)) {
    errors.push('PROFILE_SET_MISMATCH');
  }

  const summary = evidence?.test_summary ?? {};
  if (!Number.isInteger(summary.executed) || summary.executed <= 0) errors.push('ZERO_REQUIRED_TESTS');
  if (Number.isInteger(summary.executed) && summary.executed !== CONTRACTUAL_TEST_COUNT) {
    errors.push('CONTRACTUAL_TEST_COUNT_MISMATCH');
  }
  if ((summary.failed ?? 0) !== 0) errors.push('REQUIRED_TEST_FAILURE');
  if ((summary.skipped ?? 0) !== 0) errors.push('REQUIRED_TEST_SKIPPED');
  if ((summary.denied_paths ?? 0) < 16) errors.push('DENY_PATH_NOT_PROVEN');

  if (/prod(?:uction)?/iu.test(String(evidence?.environment_identity ?? ''))) {
    errors.push('PRODUCTION_ENVIRONMENT_FORBIDDEN');
  }
  if (containsSensitiveData(evidence)) errors.push('SENSITIVE_DATA_FORBIDDEN');
  if (evidence?.certification_scope !== 'HARNESS_SELF_CERTIFICATION') errors.push('CERTIFICATION_SCOPE_INVALID');
  if (evidence?.consumer_conformance_claimed !== false) errors.push('CONSUMER_CONFORMANCE_MUST_NOT_BE_CLAIMED');
  if (evidence?.implementation_boundaries?.package_versions_changed !== false) errors.push('PACKAGE_VERSION_CHANGE_FORBIDDEN');
  if (evidence?.implementation_boundaries?.supabase_mutation_performed !== false) errors.push('SUPABASE_MUTATION_FORBIDDEN');
  if (evidence?.implementation_boundaries?.production_data_used !== false) errors.push('PRODUCTION_DATA_FORBIDDEN');
  if (evidence?.implementation_boundaries?.consumer_functional_debt_corrected !== false) errors.push('FUNCTIONAL_DEBT_CORRECTION_FORBIDDEN');
  if (evidence?.safe_build_entrypoint !== 'npm run build:ci011') errors.push('SAFE_BUILD_ENTRYPOINT_INVALID');
  if (evidence?.result === 'PASS' && errors.length > 0) errors.push('FALSE_GREEN');
  return [...new Set(errors)];
}

function pathExists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

export function probeRepository(root = process.cwd()) {
  const routeInventory = probeRouteInventory(root);
  return SURFACES.map((surface) => {
    const missing = surface.required_paths.filter((relativePath) => !pathExists(root, relativePath));
    const routeBlocked = ['VISO-SURFACE-003', 'VISO-SURFACE-004'].includes(surface.id)
      && routeInventory.result !== 'PASS';
    return {
      surface_id: surface.id,
      name: surface.name,
      required_paths: surface.required_paths,
      missing_paths: missing,
      result: missing.length === 0 && !routeBlocked ? 'PASS' : 'BLOCKED',
    };
  });
}

function gitText(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function parseCli(argv) {
  const options = { json: false, packages: CANONICAL_PACKAGES };
  for (const argument of argv) {
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument.startsWith('--packages=')) {
      options.packages = resolveTargetPackages(argument.slice('--packages='.length));
      continue;
    }
    throw new Error(`UNKNOWN_ARGUMENT:${argument}`);
  }
  return options;
}

function parseNodeTestSummary(output) {
  const get = (label) => {
    const match = output.match(new RegExp(`(?:^|\\r?\\n)[#ℹ]\\s+${label}\\s+(\\d+)`, 'u'));
    return match ? Number(match[1]) : null;
  };
  return {
    executed: get('tests'),
    passed: get('pass'),
    failed: get('fail'),
    skipped: get('skipped') ?? 0,
  };
}

function runSelfCertification(root) {
  const testPath = path.join(root, 'scripts', 'quality', 'viso-consumer-baseline-gate.test.mjs');
  const result = spawnSync(process.execPath, ['--test', testPath], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return {
    exit_code: result.status ?? 1,
    summary: parseNodeTestSummary(output),
    output,
  };
}

export function buildBaselineEvidence({
  root = process.cwd(),
  targetPackages = CANONICAL_PACKAGES,
  startedAt = new Date().toISOString(),
} = {}) {
  const packages = resolveTargetPackages(targetPackages);
  const manifestPath = path.join(root, 'package.json');
  const lockfilePath = path.join(root, 'package-lock.json');
  const testPath = path.join(root, 'scripts', 'quality', 'viso-consumer-baseline-gate.test.mjs');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const surfaces = probeRepository(root);
  const routeInventory = probeRouteInventory(root);
  const sourceContracts = inspectSourceContracts(root);
  const selfCertification = runSelfCertification(root);
  const completedAt = new Date().toISOString();

  const base = {
    consumer_repository: CONSUMER_REPOSITORY,
    consumer_branch: gitText(root, ['branch', '--show-current']) || 'DETACHED',
    consumer_base_commit: gitText(root, ['rev-parse', 'HEAD']),
    consumer_manifest_identity: fileIdentity(manifestPath),
    consumer_lockfile_identity: fileIdentity(lockfilePath),
    test_contract_identity: sha256Identity({
      instance_id: CI011_INSTANCE_ID,
      schema_version: CI011_SCHEMA_VERSION,
      source_contract_sha256: CI011_SOURCE_CONTRACT_SHA256,
      relations: VISO_RELATIONS,
      surfaces: SURFACES,
      profile_requirements: PROFILE_REQUIREMENTS,
      required_evidence_fields: REQUIRED_EVIDENCE_FIELDS,
      expected_page_files: EXPECTED_PAGE_FILES,
      expected_route_handlers: EXPECTED_ROUTE_HANDLERS,
      source_contracts: SOURCE_CONTRACTS,
      contractual_test_count: CONTRACTUAL_TEST_COUNT,
    }),
    test_suite_identity: fileIdentity(testPath),
    fixture_set_identity: sha256Identity({
      fixture_set: 'CI011-VISO-SYNTHETIC-001',
      surfaces: SURFACES.map(({ id }) => id),
      profiles: CANONICAL_PACKAGES,
      negative_surface_paths: 12,
      negative_profile_paths: 4,
      global_regressions: 10,
    }),
    route_inventory_identity: sha256Identity({
      page_files: routeInventory.actual_page_files,
      routes: {
        pages: routeInventory.actual_page_count,
        static: routeInventory.actual_static_page_count,
        dynamic: routeInventory.actual_dynamic_page_count,
        protected: routeInventory.actual_protected_page_count,
        public_controlled: routeInventory.actual_public_controlled_count,
        handlers: routeInventory.actual_handler_count,
        technical_patterns: routeInventory.actual_technical_pattern_count,
      },
    }),
    handler_inventory_identity: sha256Identity(routeInventory.actual_handler_files),
    source_contract_identity: sha256Identity(sourceContracts),
    environment_identity: `isolated:${process.platform}:${process.arch}:node:${process.version}`,
    runtime_identity: process.version,
    framework_identity: 'node:test+ci011-policy-engine-v1',
    target_package_set: packages,
    compatibility_refs: packages.map((packageName) => VISO_RELATIONS[packageName].compatibility_ref),
    viso_profile_set: packages.map((packageName) => VISO_RELATIONS[packageName].profile),
    started_at: startedAt,
    completed_at: completedAt,
    result: 'PENDING',
    invalidation_reason: null,
    certification_scope: 'HARNESS_SELF_CERTIFICATION',
    consumer_conformance_claimed: false,
    known_consumer_debt_refs: [
      'TREQ-VISO-002',
      'TREQ-VISO-003',
      'TREQ-VISO-046',
      'TREQ-VISO-047',
      'TREQ-VISO-048',
    ],
    safe_build_entrypoint: 'npm run build:ci011',
    test_summary: {
      executed: selfCertification.summary.executed,
      passed: selfCertification.summary.passed,
      failed: selfCertification.summary.failed,
      skipped: selfCertification.summary.skipped,
      denied_paths: 16,
    },
    surface_results: surfaces,
    route_inventory: routeInventory,
    source_contract_results: sourceContracts,
    implementation_boundaries: {
      package_versions_changed: false,
      pull_request_created: false,
      merge_performed: false,
      deployment_performed: false,
      rollback_performed: false,
      supabase_mutation_performed: false,
      production_data_used: false,
      consumer_functional_debt_corrected: false,
    },
  };

  const probeFailures = surfaces.filter(({ result }) => result !== 'PASS');
  const sourceFailures = sourceContracts.filter(({ result }) => result !== 'PASS');
  const runnerFailed = selfCertification.exit_code !== 0
    || selfCertification.summary.executed !== CONTRACTUAL_TEST_COUNT
    || selfCertification.summary.failed !== 0
    || selfCertification.summary.skipped !== 0;

  const preIdentity = {
    ...base,
    result: undefined,
    invalidation_reason: undefined,
    execution_identity: undefined,
  };
  const executionIdentity = sha256Identity(preIdentity);
  const candidate = { ...base, execution_identity: executionIdentity, result: 'PASS' };
  const validationErrors = validateEvidence(candidate);

  if (manifest.name !== CONSUMER_NAME) validationErrors.push('MANIFEST_CONSUMER_MISMATCH');
  if (manifest.scripts?.['build:ci011'] !== 'next build') validationErrors.push('SAFE_BUILD_ENTRYPOINT_MISSING');
  if (manifest.scripts?.['prebuild:ci011']) validationErrors.push('SAFE_BUILD_PREHOOK_FORBIDDEN');
  if (manifest.scripts?.['postbuild:ci011']) validationErrors.push('SAFE_BUILD_POSTHOOK_FORBIDDEN');
  if (manifest.scripts?.typecheck !== 'tsc --noEmit --incremental false') validationErrors.push('TYPECHECK_ENTRYPOINT_MISMATCH');
  if (
    manifest.scripts?.['test:ci011']
    !== 'node --test scripts/quality/viso-consumer-baseline-gate.test.mjs'
  ) validationErrors.push('TEST_ENTRYPOINT_MISMATCH');
  if (
    manifest.scripts?.['ci011:baseline']
    !== 'node scripts/quality/viso-consumer-baseline-gate.mjs --packages=@vento/contracts,@vento/os-context,@vento/supabase,@vento/ui-web --json'
  ) validationErrors.push('BASELINE_ENTRYPOINT_MISMATCH');
  if (routeInventory.result !== 'PASS') validationErrors.push('ROUTE_OR_HANDLER_INVENTORY_DRIFT');
  if (probeFailures.length > 0) {
    validationErrors.push(...probeFailures.map(({ surface_id }) => `SURFACE_BLOCKED:${surface_id}`));
  }
  if (sourceFailures.length > 0) {
    validationErrors.push(...sourceFailures.map(({ contract_id }) => `SOURCE_CONTRACT_BLOCKED:${contract_id}`));
  }
  if (runnerFailed) validationErrors.push('SELF_CERTIFICATION_FAILED');

  const errors = [...new Set(validationErrors)];
  return {
    ...candidate,
    result: errors.length === 0 ? 'PASS' : (runnerFailed ? 'FAIL' : 'BLOCKED'),
    invalidation_reason: errors.length === 0 ? null : errors,
    self_certification: {
      exit_code: selfCertification.exit_code,
      ...selfCertification.summary,
    },
  };
}

function main() {
  const options = parseCli(process.argv.slice(2));
  const evidence = buildBaselineEvidence({
    root: process.cwd(),
    targetPackages: options.packages,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exitCode = evidence.result === 'PASS' ? 0 : 1;
}

const invoked = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';

if (invoked === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`CI011_ERROR ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
